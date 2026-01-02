import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatusPill from "../components/StatusPill";
import { api, type UptimePoint, type WebAppDetail } from "../lib/api";
import { formatDateTime, formatMs } from "../lib/format";

type Range = "24h" | "7d" | "30d";

function parseContainers(payload: unknown):
  | Array<{ name?: string; image?: string; state?: string; status?: string; ports?: string[] }>
  | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as any;
  const containers = p?.docker?.containers;
  if (!Array.isArray(containers)) return null;
  return containers;
}

function parseSystem(payload: unknown):
  | {
      hostname?: string;
      cpuLoad?: number;
      memTotal?: number;
      memUsed?: number;
      disk?: Array<{ mount?: string; size?: number; used?: number; available?: number }>;
    }
  | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as any;
  const system = p?.system;
  if (!system || typeof system !== "object") return null;

  const disk = Array.isArray(system?.disk) ? system.disk : null;
  return {
    hostname: system?.hostname,
    cpuLoad: typeof system?.cpu?.load === "number" ? system.cpu.load : undefined,
    memTotal: typeof system?.mem?.total === "number" ? system.mem.total : undefined,
    memUsed: typeof system?.mem?.used === "number" ? system.mem.used : undefined,
    disk: disk
      ? disk.map((d: any) => ({
          mount: d?.mount,
          size: typeof d?.size === "number" ? d.size : undefined,
          used: typeof d?.used === "number" ? d.used : undefined,
          available: typeof d?.available === "number" ? d.available : undefined
        }))
      : undefined
  };
}

function formatBytes(v: number | undefined): string {
  if (!v || !Number.isFinite(v)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = v;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

export default function WebappDetail() {
  const { id } = useParams();
  const webAppId = id ?? "";

  const [detail, setDetail] = useState<WebAppDetail | null>(null);
  const [points, setPoints] = useState<UptimePoint[]>([]);
  const [range, setRange] = useState<Range>("24h");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!webAppId) return;
    api
      .webapp(webAppId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [webAppId]);

  useEffect(() => {
    if (!webAppId) return;
    api
      .uptime(webAppId, range)
      .then(setPoints)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [webAppId, range]);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        t: new Date(p.checkedAt).toLocaleString(),
        responseTimeMs: p.responseTimeMs ?? null,
        ok: p.ok
      })),
    [points]
  );

  const containers = useMemo(() => parseContainers(detail?.latestReport?.payload ?? null), [detail?.latestReport?.payload]);
  const system = useMemo(() => parseSystem(detail?.latestReport?.payload ?? null), [detail?.latestReport?.payload]);

  if (!webAppId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-600">
            <Link className="hover:underline" to="/webapps">
              Webapps
            </Link>
            <span className="px-2">/</span>
            <span className="text-slate-900">Details</span>
          </div>
          <h1 className="text-xl font-semibold">{detail?.name ?? "…"}</h1>
          <div className="text-sm text-slate-600">{detail?.url}</div>
        </div>
        <div className="pt-1">
          <StatusPill ok={detail?.lastCheck ? detail.lastCheck.ok : null} />
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Uptime history</div>
              <div className="text-xs text-slate-500">Response time over time (ms)</div>
            </div>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              aria-label="Uptime range"
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
            >
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
            </select>
          </div>

          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="t" hide />
                <YAxis width={40} />
                <Tooltip />
                <Line type="monotone" dataKey="responseTimeMs" strokeWidth={2} dot={false} stroke="#0f172a" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Points: {points.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="font-medium">Current</div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-slate-600">Last check</div>
              <div className="font-medium">{formatDateTime(detail?.lastCheck?.checkedAt)}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-slate-600">HTTP</div>
              <div className="font-medium">{detail?.lastCheck?.httpStatus ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-slate-600">Response</div>
              <div className="font-medium">{formatMs(detail?.lastCheck?.responseTimeMs ?? null)}</div>
            </div>
            <div className="pt-2 text-xs text-slate-500">
              Server: {detail?.server?.name ?? "—"}
              <div>Server last seen: {formatDateTime(detail?.server?.lastSeenAt)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Server resources</div>
            <div className="text-xs text-slate-500">Latest agent snapshot for this server</div>
          </div>
          <div className="text-xs text-slate-500">Reported: {formatDateTime(detail?.latestReport?.reportedAt)}</div>
        </div>

        {!detail?.latestReport ? <div className="mt-3 text-sm text-slate-600">No agent report for this server yet.</div> : null}

        {system ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Hostname</div>
              <div className="text-sm font-medium">{system.hostname ?? "—"}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600">CPU load</div>
              <div className="text-sm font-medium">
                {typeof system.cpuLoad === "number" ? `${system.cpuLoad.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Memory</div>
              <div className="text-sm font-medium">
                {formatBytes(system.memUsed)} / {formatBytes(system.memTotal)}
              </div>
            </div>
          </div>
        ) : null}

        {system?.disk && system.disk.length ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">Mount</th>
                  <th className="px-3 py-2">Used</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Available</th>
                </tr>
              </thead>
              <tbody>
                {system.disk.map((d, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium">{d.mount ?? "—"}</td>
                    <td className="px-3 py-2">{formatBytes(d.used)}</td>
                    <td className="px-3 py-2">{formatBytes(d.size)}</td>
                    <td className="px-3 py-2">{formatBytes(d.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {containers ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Ports</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium">{c.name ?? "—"}</td>
                    <td className="px-3 py-2">{c.image ?? "—"}</td>
                    <td className="px-3 py-2">{c.state ?? c.status ?? "—"}</td>
                    <td className="px-3 py-2">{Array.isArray(c.ports) && c.ports.length ? c.ports.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : detail?.latestReport ? (
          <div className="mt-3 text-sm text-slate-600">Agent report present, but no Docker container list found.</div>
        ) : null}
      </div>
    </div>
  );
}
