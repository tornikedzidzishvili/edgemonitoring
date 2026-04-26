import { Client } from "ssh2";

export type SshProbeRequest = {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  passphrase?: string;
  timeoutMs?: number;
  includeDocker?: boolean;
};

export type SshProbeResult = {
  collectedAt: string;
  target: { host: string; port: number; username: string };
  system: {
    loadavg?: { one: number; five: number; fifteen: number };
    mem?: {
      memTotalBytes: number;
      memAvailableBytes: number;
      swapTotalBytes: number;
      swapFreeBytes: number;
    };
    disks?: Array<{ filesystem: string; sizeBytes: number; usedBytes: number; availableBytes: number; mount: string }>
    net?: Array<{ iface: string; rxBytes: number; txBytes: number }>;
    diskstats?: Array<{ device: string; readSectors: number; writeSectors: number }>;
  };
  docker?: {
    containers?: Array<{ id: string; name: string; image: string; status: string }>;
    stats?: Array<{ id: string; name: string; cpuPerc: string; memUsage: string; netIO: string; blockIO: string }>;
    error?: string;
  };
};

type ExecResult = { stdout: string; stderr: string; code: number | null; signal: string | null };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (t) clearTimeout(t);
  });
}

function parseMeminfo(meminfo: string): SshProbeResult["system"]["mem"] | undefined {
  // Values are in kB.
  const map = new Map<string, number>();
  for (const line of meminfo.split(/\r?\n/)) {
    const m = /^([A-Za-z_()]+):\s+(\d+)\s+kB\s*$/.exec(line.trim());
    if (!m) continue;
    map.set(m[1], Number(m[2]) * 1024);
  }
  const memTotalBytes = map.get("MemTotal");
  const memAvailableBytes = map.get("MemAvailable") ?? map.get("MemFree");
  const swapTotalBytes = map.get("SwapTotal");
  const swapFreeBytes = map.get("SwapFree");
  if (
    memTotalBytes === undefined ||
    memAvailableBytes === undefined ||
    swapTotalBytes === undefined ||
    swapFreeBytes === undefined
  ) {
    return undefined;
  }
  return { memTotalBytes, memAvailableBytes, swapTotalBytes, swapFreeBytes };
}

function parseLoadavg(text: string): { one: number; five: number; fifteen: number } | undefined {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return undefined;
  const one = Number(parts[0]);
  const five = Number(parts[1]);
  const fifteen = Number(parts[2]);
  if (![one, five, fifteen].every((n) => Number.isFinite(n))) return undefined;
  return { one, five, fifteen };
}

function parseDf(text: string): Array<{ filesystem: string; sizeBytes: number; usedBytes: number; availableBytes: number; mount: string }> {
  // df -B1P columns: Filesystem 1B-blocks Used Available Use% Mounted on
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const out: Array<{ filesystem: string; sizeBytes: number; usedBytes: number; availableBytes: number; mount: string }> = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/\s+/);
    if (cols.length < 6) continue;
    const [filesystem, sizeStr, usedStr, availStr, _usePct, ...mountParts] = cols;
    const mount = mountParts.join(" ");
    const sizeBytes = Number(sizeStr);
    const usedBytes = Number(usedStr);
    const availableBytes = Number(availStr);
    if (![sizeBytes, usedBytes, availableBytes].every((n) => Number.isFinite(n))) continue;
    out.push({ filesystem, sizeBytes, usedBytes, availableBytes, mount });
  }
  return out;
}

function parseNetDev(text: string): Array<{ iface: string; rxBytes: number; txBytes: number }> {
  // /proc/net/dev: iface: rxBytes ... txBytes ...
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Array<{ iface: string; rxBytes: number; txBytes: number }> = [];
  for (const line of lines) {
    if (!line.includes(":")) continue;
    if (line.startsWith("Inter-") || line.startsWith("face")) continue;
    const [ifacePart, rest] = line.split(":", 2);
    const iface = ifacePart.trim();
    const cols = rest.trim().split(/\s+/);
    if (cols.length < 16) continue;
    const rxBytes = Number(cols[0]);
    const txBytes = Number(cols[8]);
    if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
    out.push({ iface, rxBytes, txBytes });
  }
  return out;
}

function parseDiskstats(text: string): Array<{ device: string; readSectors: number; writeSectors: number }> {
  // /proc/diskstats columns (kernel dependent), but read sectors is field 6, write sectors is field 10.
  const out: Array<{ device: string; readSectors: number; writeSectors: number }> = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 14) continue;
    const device = cols[2];
    const readSectors = Number(cols[5]);
    const writeSectors = Number(cols[9]);
    if (!device || !Number.isFinite(readSectors) || !Number.isFinite(writeSectors)) continue;
    // Skip partitions like sda1? keep both; caller can filter.
    out.push({ device, readSectors, writeSectors });
  }
  return out;
}

function parseDockerPs(text: string): Array<{ id: string; name: string; image: string; status: string }> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Array<{ id: string; name: string; image: string; status: string }> = [];
  for (const line of lines) {
    const [id, name, image, ...statusParts] = line.split("|");
    if (!id || !name || !image) continue;
    out.push({ id, name, image, status: statusParts.join("|").trim() });
  }
  return out;
}

function parseDockerStats(text: string): Array<{ id: string; name: string; cpuPerc: string; memUsage: string; netIO: string; blockIO: string }> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Array<{ id: string; name: string; cpuPerc: string; memUsage: string; netIO: string; blockIO: string }> = [];
  for (const line of lines) {
    const [id, name, cpuPerc, memUsage, netIO, blockIO] = line.split("|");
    if (!id || !name) continue;
    out.push({ id, name, cpuPerc: cpuPerc ?? "", memUsage: memUsage ?? "", netIO: netIO ?? "", blockIO: blockIO ?? "" });
  }
  return out;
}

async function connectSsh(params: SshProbeRequest): Promise<Client> {
  const conn = new Client();

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      conn
        .on("ready", () => resolve())
        .on("error", (err) => reject(err))
        .connect({
          host: params.host,
          port: params.port,
          username: params.username,
          privateKey: params.privateKey,
          passphrase: params.passphrase,
          readyTimeout: params.timeoutMs ?? 15_000
        });
    }),
    params.timeoutMs ?? 15_000,
    "ssh-connect"
  );

  return conn;
}

async function exec(conn: Client, command: string, timeoutMs: number): Promise<ExecResult> {
  return withTimeout(
    new Promise<ExecResult>((resolve, reject) => {
      conn.exec(command, { pty: false }, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream
          .on("data", (d: Buffer) => {
            stdout += d.toString("utf8");
          })
          .stderr.on("data", (d: Buffer) => {
            stderr += d.toString("utf8");
          });
        stream.on("close", (code: number | null, signal: string | null) => {
          resolve({ stdout, stderr, code, signal });
        });
      });
    }),
    timeoutMs,
    "ssh-exec"
  );
}

// ---------------------------------------------------------------------------
// openSshSession — exported adapter for EMS-23 CyberPanel sync
// ---------------------------------------------------------------------------

/**
 * A live SSH connection adapted to the SshSession interface expected by the
 * CyberPanel service helpers (EMS-22). Callers must call `close()` when done —
 * use a try/finally block to guarantee cleanup even on error.
 *
 * The `execTimeoutMs` field controls per-command timeout (defaults to 30 s).
 * A separate per-server budget timeout should be enforced by the caller via
 * Promise.race; this value is only a per-command guard against hung commands.
 */
export interface OpenSshSession {
  exec(cmd: string): Promise<{ stdout: string; stderr: string; code: number }>;
  close(): void;
}

/**
 * Open an SSH connection and return an adapter implementing OpenSshSession.
 *
 * Reuses the same `connectSsh` / `exec` primitives used by `probeOverSsh`;
 * no new ssh2 logic is introduced here. The `signal`-terminated case (null
 * exit code) is normalised to exit code 1 so callers always receive a number.
 */
export async function openSshSession(
  params: SshProbeRequest & { execTimeoutMs?: number }
): Promise<OpenSshSession> {
  const conn = await connectSsh(params);
  const execTimeoutMs = params.execTimeoutMs ?? 30_000;

  return {
    async exec(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
      const result = await exec(conn, cmd, execTimeoutMs);
      // Normalise signal-terminated (null code) to non-zero so callers always
      // receive a `number` as required by the SshSession interface.
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code ?? 1,
      };
    },
    close(): void {
      try {
        conn.end();
      } catch {
        // Ignore errors on close — connection may already be gone.
      }
    },
  };
}

export async function probeOverSsh(params: SshProbeRequest): Promise<SshProbeResult> {
  const timeoutMs = params.timeoutMs ?? 20_000;
  const conn = await connectSsh(params);

  try {
    const [loadavgRes, meminfoRes, dfRes, netDevRes, diskstatsRes] = await Promise.all([
      exec(conn, "cat /proc/loadavg", timeoutMs),
      exec(conn, "cat /proc/meminfo", timeoutMs),
      exec(conn, "df -B1P", timeoutMs),
      exec(conn, "cat /proc/net/dev", timeoutMs),
      exec(conn, "cat /proc/diskstats", timeoutMs)
    ]);

    const result: SshProbeResult = {
      collectedAt: new Date().toISOString(),
      target: { host: params.host, port: params.port, username: params.username },
      system: {
        loadavg: loadavgRes.code === 0 ? parseLoadavg(loadavgRes.stdout) : undefined,
        mem: meminfoRes.code === 0 ? parseMeminfo(meminfoRes.stdout) : undefined,
        disks: dfRes.code === 0 ? parseDf(dfRes.stdout) : undefined,
        net: netDevRes.code === 0 ? parseNetDev(netDevRes.stdout) : undefined,
        diskstats: diskstatsRes.code === 0 ? parseDiskstats(diskstatsRes.stdout) : undefined
      }
    };

    if (params.includeDocker !== false) {
      const docker: NonNullable<SshProbeResult["docker"]> = {};
      try {
        const [psRes, statsRes] = await Promise.all([
          exec(conn, "docker ps -a --no-trunc --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}'", timeoutMs),
          exec(conn, "docker stats --no-stream --no-trunc --format '{{.Container}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}'", timeoutMs)
        ]);

        docker.containers = psRes.code === 0 ? parseDockerPs(psRes.stdout) : undefined;
        docker.stats = statsRes.code === 0 ? parseDockerStats(statsRes.stdout) : undefined;
        if (psRes.code !== 0 || statsRes.code !== 0) {
          docker.error = [psRes.stderr, statsRes.stderr].filter(Boolean).join("\n") || "docker-commands-failed";
        }
      } catch (err) {
        docker.error = err instanceof Error ? err.message : "docker-probe-failed";
      }
      result.docker = docker;
    }

    return result;
  } finally {
    conn.end();
  }
}
