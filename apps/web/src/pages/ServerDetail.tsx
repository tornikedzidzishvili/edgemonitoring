import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE_URL, api, type ServerDetail, type ServerEndpoint, type ServerMetricsPoint } from "../lib/api";
import { formatDateTime, formatUptime, formatPct as formatPctLib, formatMs } from "../lib/format";

type LivePoint = {
  t: string;
  cpuLoad: number | null;
  memUsedPct: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  reportedAt: string;
};

function formatBytes(v: number | null | undefined): string {
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

function formatPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function ServerIcon({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
        isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    </div>
  );
}

function ConnectionBadge({ status }: { status: "connecting" | "open" | "reconnecting" | "closed" }) {
  const styles = {
    connecting: "bg-amber-100 text-amber-800",
    open: "bg-emerald-100 text-emerald-800",
    reconnecting: "bg-amber-100 text-amber-800",
    closed: "bg-slate-100 text-slate-600"
  };
  const labels = {
    connecting: "Connecting",
    open: "Live",
    reconnecting: "Reconnecting",
    closed: "Disconnected"
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {status === "open" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {labels[status]}
    </span>
  );
}

function EndpointUptimeBar({ buckets }: { buckets: (boolean | null)[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {buckets.map((status, idx) => (
        <div
          key={idx}
          className={`h-5 w-1.5 rounded-full ${
            status === true ? "bg-emerald-500" : status === false ? "bg-rose-500" : "bg-slate-200"
          }`}
          title={`${idx * 30}m - ${(idx + 1) * 30}m ago: ${status === true ? "Up" : status === false ? "Down" : "No data"}`}
        />
      ))}
    </div>
  );
}

function parseAgentSnapshot(payload: unknown): {
  cpuLoad?: number;
  memUsed?: number;
  memTotal?: number;
  disk?: Array<{ fs?: string; size?: number; used?: number; available?: number; mount?: string }>;
  processesTop?: Array<{ pid?: number; name?: string; cpuPercent?: number | null; memPercent?: number | null }>;
  processesTopCpu?: Array<{ pid?: number; name?: string; cpuPercent?: number | null; memPercent?: number | null }>;
  processesTopMem?: Array<{ pid?: number; name?: string; cpuPercent?: number | null; memPercent?: number | null }>;
  // legacy
  topProcesses?: Array<{ pid?: number; name?: string; cpu?: number; mem?: number }>;
  containers?: Array<{ name?: string; image?: string; state?: string; status?: string; ports?: string[] }>;
  containerStats?: Array<{
    id?: string;
    name?: string;
    cpuPercent?: number;
    memPercent?: number;
    memUsageBytes?: number;
    memLimitBytes?: number;
    netRxBytes?: number;
    netTxBytes?: number;
    blockReadBytes?: number;
    blockWriteBytes?: number;
  }>;
  dockerError?: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as any;

  const system = p?.system;
  const docker = p?.docker;

  const cpuLoad = typeof system?.cpu?.load === "number" ? system.cpu.load : undefined;
  const memTotal = typeof system?.mem?.total === "number" ? system.mem.total : undefined;
  const memUsed = typeof system?.mem?.used === "number" ? system.mem.used : undefined;

  const disk = Array.isArray(system?.disk)
    ? system.disk.map((d: any) => ({
        fs: d?.fs,
        size: typeof d?.size === "number" ? d.size : undefined,
        used: typeof d?.used === "number" ? d.used : undefined,
        available: typeof d?.available === "number" ? d.available : undefined,
        mount: d?.mount
      }))
    : undefined;

  const processesTop = Array.isArray(system?.processesTop)
    ? system.processesTop.map((p: any) => ({
        pid: typeof p?.pid === "number" ? p.pid : undefined,
        name: typeof p?.name === "string" ? p.name : undefined,
        cpuPercent: typeof p?.cpuPercent === "number" ? p.cpuPercent : p?.cpuPercent === null ? null : undefined,
        memPercent: typeof p?.memPercent === "number" ? p.memPercent : p?.memPercent === null ? null : undefined
      }))
    : undefined;

  const processesTopCpu = Array.isArray(system?.processesTopCpu)
    ? system.processesTopCpu.map((p: any) => ({
        pid: typeof p?.pid === "number" ? p.pid : undefined,
        name: typeof p?.name === "string" ? p.name : undefined,
        cpuPercent: typeof p?.cpuPercent === "number" ? p.cpuPercent : p?.cpuPercent === null ? null : undefined,
        memPercent: typeof p?.memPercent === "number" ? p.memPercent : p?.memPercent === null ? null : undefined
      }))
    : undefined;

  const processesTopMem = Array.isArray(system?.processesTopMem)
    ? system.processesTopMem.map((p: any) => ({
        pid: typeof p?.pid === "number" ? p.pid : undefined,
        name: typeof p?.name === "string" ? p.name : undefined,
        cpuPercent: typeof p?.cpuPercent === "number" ? p.cpuPercent : p?.cpuPercent === null ? null : undefined,
        memPercent: typeof p?.memPercent === "number" ? p.memPercent : p?.memPercent === null ? null : undefined
      }))
    : undefined;

  const topProcesses = Array.isArray(system?.topProcesses)
    ? system.topProcesses.map((p: any) => ({
        pid: typeof p?.pid === "number" ? p.pid : undefined,
        name: typeof p?.name === "string" ? p.name : undefined,
        cpu: typeof p?.cpu === "number" ? p.cpu : undefined,
        mem: typeof p?.mem === "number" ? p.mem : undefined
      }))
    : undefined;

  const containers = Array.isArray(docker?.containers)
    ? docker.containers.map((c: any) => ({
        name: c?.name,
        image: c?.image,
        state: c?.state,
        status: c?.status,
        ports: Array.isArray(c?.ports) ? c.ports : undefined
      }))
    : undefined;

  const containerStats = Array.isArray(docker?.stats)
    ? docker.stats.map((s: any) => ({
        id: s?.id,
        name: s?.name,
        cpuPercent: typeof s?.cpuPercent === "number" ? s.cpuPercent : undefined,
        memPercent: typeof s?.memPercent === "number" ? s.memPercent : undefined,
        memUsageBytes: typeof s?.memUsageBytes === "number" ? s.memUsageBytes : undefined,
        memLimitBytes: typeof s?.memLimitBytes === "number" ? s.memLimitBytes : undefined,
        netRxBytes: typeof s?.netRxBytes === "number" ? s.netRxBytes : undefined,
        netTxBytes: typeof s?.netTxBytes === "number" ? s.netTxBytes : undefined,
        blockReadBytes: typeof s?.blockReadBytes === "number" ? s.blockReadBytes : undefined,
        blockWriteBytes: typeof s?.blockWriteBytes === "number" ? s.blockWriteBytes : undefined
      }))
    : undefined;

  const dockerError = typeof docker?.error === "string" ? docker.error : undefined;

  return {
    cpuLoad,
    memUsed,
    memTotal,
    disk,
    processesTop,
    processesTopCpu,
    processesTopMem,
    topProcesses,
    containers,
    containerStats,
    dockerError
  };
}

export default function ServerDetailPage() {
  const { id } = useParams();
  const serverId = id ?? "";

  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"connecting" | "open" | "reconnecting" | "closed">("connecting");

  const [live, setLive] = useState<LivePoint[]>([]);
  const lastReportedAtRef = useRef<string | null>(null);

  const [metricsDays, setMetricsDays] = useState<1 | 5 | 15 | 30>(1);
  const [metricsStepMinutes, setMetricsStepMinutes] = useState<5 | 15 | 30 | 60>(60);
  const [metrics, setMetrics] = useState<ServerMetricsPoint[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Keep defaults sensible for longer ranges to avoid heavy charts.
  useEffect(() => {
    const recommended: 5 | 15 | 30 | 60 = metricsDays === 1 ? 60 : metricsDays === 5 ? 5 : metricsDays === 15 ? 15 : 60;
    setMetricsStepMinutes(recommended);
  }, [metricsDays]);

  // Endpoints state
  const [endpoints, setEndpoints] = useState<ServerEndpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(true);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  // Add endpoint form
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [savingEndpoint, setSavingEndpoint] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    api
      .server(serverId)
      .then((d) => {
        setDetail(d);
        setError(null);

        if (d.latestReport?.reportedAt) {
          lastReportedAtRef.current = d.latestReport.reportedAt;
          const snap = parseAgentSnapshot(d.latestReport.payload);
          if (snap) {
            const memPct =
              typeof snap.memUsed === "number" && typeof snap.memTotal === "number" && snap.memTotal > 0
                ? clamp01(snap.memUsed / snap.memTotal)
                : null;
            setLive([
              {
                t: new Date(d.latestReport.reportedAt).toLocaleTimeString(),
                cpuLoad: typeof snap.cpuLoad === "number" ? snap.cpuLoad : null,
                memUsedPct: memPct === null ? null : Math.round(memPct * 1000) / 10,
                memUsedBytes: typeof snap.memUsed === "number" ? snap.memUsed : null,
                memTotalBytes: typeof snap.memTotal === "number" ? snap.memTotal : null,
                reportedAt: d.latestReport.reportedAt
              }
            ]);
          }
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [serverId]);

  // Load endpoints
  useEffect(() => {
    if (!serverId) return;
    setEndpointsLoading(true);
    api
      .serverEndpoints(serverId)
      .then((res) => {
        setEndpoints(res.endpoints);
      })
      .catch(() => {
        // Non-fatal
      })
      .finally(() => setEndpointsLoading(false));
  }, [serverId]);

  // Load historical CPU/memory series (persists across page visits)
  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;

    const load = async () => {
      setMetricsLoading(true);
      try {
        const res = await api.serverMetrics(serverId, { days: metricsDays, stepMinutes: metricsStepMinutes });
        if (!cancelled) setMetrics(res.points);
      } catch {
        if (!cancelled) setMetrics([]);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    };

    load();
    const poll = setInterval(() => {
      load().catch(() => {
        // ignore
      });
    }, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [serverId, metricsDays, metricsStepMinutes]);

  useEffect(() => {
    if (!serverId) return;

    setConnection("connecting");
    const url = `${API_BASE_URL}/servers/${encodeURIComponent(serverId)}/stream`;
    const es = new EventSource(url);

    es.onopen = () => setConnection("open");

    const onError = () => {
      setConnection((prev) => (prev === "closed" ? "closed" : "reconnecting"));
    };
    es.onerror = onError;

    es.addEventListener("report", (evt) => {
      try {
        const msg = JSON.parse((evt as MessageEvent).data) as { reportedAt: string; payload: unknown; server?: { name?: string } };
        if (!msg?.reportedAt) return;

        if (lastReportedAtRef.current && msg.reportedAt <= lastReportedAtRef.current) return;
        lastReportedAtRef.current = msg.reportedAt;

        const snap = parseAgentSnapshot(msg.payload);
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                name: msg?.server?.name ?? prev.name,
                latestReport: { reportedAt: msg.reportedAt, payload: msg.payload }
              }
            : prev
        );

        if (snap) {
          const memPct =
            typeof snap.memUsed === "number" && typeof snap.memTotal === "number" && snap.memTotal > 0
              ? clamp01(snap.memUsed / snap.memTotal)
              : null;

          setLive((prev) => {
            const next: LivePoint = {
              t: new Date(msg.reportedAt).toLocaleTimeString(),
              cpuLoad: typeof snap.cpuLoad === "number" ? snap.cpuLoad : null,
              memUsedPct: memPct === null ? null : Math.round(memPct * 1000) / 10,
              memUsedBytes: typeof snap.memUsed === "number" ? snap.memUsed : null,
              memTotalBytes: typeof snap.memTotal === "number" ? snap.memTotal : null,
              reportedAt: msg.reportedAt
            };
            const merged = [...prev, next];
            return merged.slice(Math.max(0, merged.length - 120));
          });
        }
      } catch {
        // ignore
      }
    });

    return () => {
      setConnection("closed");
      es.close();
    };
  }, [serverId]);

  const latestSnap = useMemo(() => {
    const payload = detail?.latestReport?.payload ?? null;
    return parseAgentSnapshot(payload);
  }, [detail?.latestReport?.payload]);

  const monitorDocker = useMemo(() => {
    const specs = detail?.specs;
    if (!specs || typeof specs !== "object") return true;
    return (specs as any)?.monitorDocker !== false;
  }, [detail?.specs]);

  const statsByName = useMemo(() => {
    const m = new Map<string, NonNullable<NonNullable<ReturnType<typeof parseAgentSnapshot>>["containerStats"]>[number]>();
    const list = latestSnap?.containerStats ?? [];
    for (const s of list) {
      const name = typeof s?.name === "string" ? s.name : "";
      if (!name) continue;
      m.set(name, s);
    }
    return m;
  }, [latestSnap?.containerStats]);

  const cpuSeries = useMemo(
    () =>
      metrics.map((p) => ({
        t: p.t,
        cpu: p.cpuLoad
      })),
    [metrics]
  );
  const memSeries = useMemo(
    () =>
      metrics.map((p) => ({
        t: p.t,
        mem: p.memUsedPct
      })),
    [metrics]
  );

  const isActive = detail?.lastSeenAt ? Date.now() - new Date(detail.lastSeenAt).getTime() < 5 * 60 * 1000 : false;
  const uptimeMs = detail?.createdAt ? Date.now() - new Date(detail.createdAt).getTime() : 0;

  async function handleAddEndpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!serverId) return;
    setSavingEndpoint(true);
    try {
      await api.adminCreateWebapp({
        name: endpointName,
        url: endpointUrl,
        serverId
      });
      setEndpointName("");
      setEndpointUrl("");
      setShowAddEndpoint(false);
      // Refresh endpoints
      const res = await api.serverEndpoints(serverId);
      setEndpoints(res.endpoints);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add endpoint");
    } finally {
      setSavingEndpoint(false);
    }
  }

  if (!serverId) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <ServerIcon isActive={isActive} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{detail?.name ?? "Loading..."}</h1>
              {isActive ? (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  Offline
                </span>
              )}
              <ConnectionBadge status={connection} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              {detail?.ip && <span>{detail.ip}</span>}
              {detail?.vendor && <span>{detail.vendor}</span>}
              <span>Uptime: {formatUptime(uptimeMs)}</span>
            </div>
          </div>
          <Link
            to="/servers"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Servers
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">CPU Load</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {latestSnap?.cpuLoad !== undefined ? `${latestSnap.cpuLoad.toFixed(1)}%` : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">Current load average</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Memory</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {latestSnap?.memUsed !== undefined && latestSnap?.memTotal !== undefined && latestSnap.memTotal > 0
              ? `${((latestSnap.memUsed / latestSnap.memTotal) * 100).toFixed(1)}%`
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatBytes(latestSnap?.memUsed)} / {formatBytes(latestSnap?.memTotal)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Endpoints</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{endpoints.length}</div>
          <div className="mt-1 text-xs text-slate-500">
            {endpoints.filter((e) => e.lastCheck?.ok).length} up
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Containers</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{latestSnap?.containers?.length ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">
            {monitorDocker ? "Docker monitoring enabled" : "Docker monitoring disabled"}
          </div>
        </div>
      </div>

      {/* HTTP Endpoints Section */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="font-medium">HTTP Endpoints</div>
            <div className="text-xs text-slate-500">Monitor URLs and services running on this server</div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddEndpoint(!showAddEndpoint)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            {showAddEndpoint ? "Cancel" : "Add Endpoint"}
          </button>
        </div>

        {showAddEndpoint && (
          <form onSubmit={handleAddEndpoint} className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Name</label>
                <input
                  type="text"
                  value={endpointName}
                  onChange={(e) => setEndpointName(e.target.value)}
                  placeholder="API Health"
                  required
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600">URL</label>
                <input
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.example.com/health or 10.0.0.1:8080"
                  required
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                type="submit"
                disabled={savingEndpoint}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingEndpoint ? "Adding..." : "Add Endpoint"}
              </button>
            </div>
          </form>
        )}

        {endpointsLoading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Loading endpoints...</div>
        ) : endpoints.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            No endpoints configured. Add an endpoint to monitor URLs on this server.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id}>
                <div
                  className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-slate-50"
                  onClick={() => setExpandedEndpoint(expandedEndpoint === endpoint.id ? null : endpoint.id)}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      endpoint.lastCheck?.ok === true
                        ? "bg-emerald-100 text-emerald-600"
                        : endpoint.lastCheck?.ok === false
                          ? "bg-rose-100 text-rose-600"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{endpoint.name}</span>
                      {endpoint.lastCheck?.ok === true && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Up
                        </span>
                      )}
                      {endpoint.lastCheck?.ok === false && (
                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                          Down
                        </span>
                      )}
                      {endpoint.lastCheck === null && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          No data
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-500">{endpoint.url}</div>
                  </div>

                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-medium text-slate-700">
                      {endpoint.uptime24h !== null ? `${(endpoint.uptime24h * 100).toFixed(1)}%` : "—"}
                    </div>
                    <div className="text-xs text-slate-500">24h uptime</div>
                  </div>

                  <div className="hidden lg:block">
                    <EndpointUptimeBar buckets={endpoint.buckets} />
                  </div>

                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 text-slate-400 transition-transform ${expandedEndpoint === endpoint.id ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                {expandedEndpoint === endpoint.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <div className="text-xs font-medium text-slate-600">Last Check</div>
                        <div className="mt-1 text-sm text-slate-900">{formatDateTime(endpoint.lastCheck?.checkedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-600">HTTP Status</div>
                        <div className="mt-1 text-sm text-slate-900">{endpoint.lastCheck?.httpStatus ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-600">Response Time</div>
                        <div className="mt-1 text-sm text-slate-900">{formatMs(endpoint.lastCheck?.responseTimeMs ?? null)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-600">24h Uptime</div>
                        <div className="mt-1 text-sm text-slate-900">{formatPctLib(endpoint.uptime24h)}</div>
                      </div>
                    </div>
                    {endpoint.lastCheck?.error && (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        Error: {endpoint.lastCheck.error}
                      </div>
                    )}
                    <div className="mt-3 lg:hidden">
                      <div className="text-xs font-medium text-slate-600 mb-2">Last 12 hours</div>
                      <EndpointUptimeBar buckets={endpoint.buckets} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!detail?.latestReport ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-amber-900">No realtime stats yet</div>
              <div className="mt-1 text-sm text-amber-800">
                CPU/memory/disk/docker stats come from the agent. Go to{" "}
                <Link to="/servers/manage" className="font-medium underline">
                  Manage Servers
                </Link>{" "}
                to generate an agent key, then run the agent on this server.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">CPU Load</div>
              <div className="text-xs text-slate-500">
                {metricsLoading ? "Loading…" : `${metrics.length} points`} • {metricsDays}d • {metricsStepMinutes}m step
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-slate-600">
                Range
                <select
                  value={metricsDays}
                  onChange={(e) => setMetricsDays(Number(e.target.value) as 1 | 5 | 15 | 30)}
                  className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value={1}>1 day</option>
                  <option value={5}>5 days</option>
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Interval
                <select
                  value={metricsStepMinutes}
                  onChange={(e) => setMetricsStepMinutes(Number(e.target.value) as 5 | 15 | 30 | 60)}
                  className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value={5}>5 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </label>
              <div className="text-xs text-slate-500">Applies to CPU & Memory</div>
            </div>
          </div>
          <div className="p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpuSeries}>
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                    tickFormatter={(v) => {
                      const d = new Date(String(v));
                      return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v);
                    }}
                  />
                  <YAxis width={40} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(v) => {
                      const d = new Date(String(v));
                      return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v);
                    }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                    }}
                  />
                  <Line type="monotone" dataKey="cpu" strokeWidth={2} dot={false} stroke="#10b981" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Memory Usage</div>
              <div className="text-xs text-slate-500">
                {formatBytes(latestSnap?.memUsed)} / {formatBytes(latestSnap?.memTotal)}
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={memSeries}>
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                    tickFormatter={(v) => {
                      const d = new Date(String(v));
                      return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v);
                    }}
                  />
                  <YAxis width={40} domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v) => (typeof v === "number" ? `${v}%` : "—")}
                    labelFormatter={(v) => {
                      const d = new Date(String(v));
                      return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v);
                    }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                    }}
                  />
                  <Line type="monotone" dataKey="mem" strokeWidth={2} dot={false} stroke="#6366f1" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Disk */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="font-medium">Disk Usage</div>
        </div>
        {!latestSnap?.disk?.length ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">No disk information available yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-5 py-3">Mount Point</th>
                  <th className="px-5 py-3">Used</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Available</th>
                  <th className="px-5 py-3">Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {latestSnap.disk.map((d, idx) => {
                  const usagePct = d.size && d.used ? (d.used / d.size) * 100 : 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{d.mount ?? "—"}</td>
                      <td className="px-5 py-3 text-slate-600">{formatBytes(d.used)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatBytes(d.size)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatBytes(d.available)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(usagePct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{usagePct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {monitorDocker ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Docker Containers</div>
              <div className="text-sm text-slate-500">{latestSnap?.containers?.length ?? 0} containers</div>
            </div>
          </div>

          {latestSnap?.dockerError ? (
            <div className="px-5 py-4">
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Docker error: {latestSnap.dockerError}
              </div>
            </div>
          ) : !latestSnap?.containers?.length ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">No containers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Container</th>
                    <th className="px-5 py-3">Image</th>
                    <th className="px-5 py-3">State</th>
                    <th className="px-5 py-3">CPU</th>
                    <th className="px-5 py-3">Memory</th>
                    <th className="px-5 py-3">Network I/O</th>
                    <th className="px-5 py-3">Block I/O</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {latestSnap.containers.map((c, idx) => {
                    const stats = statsByName.get(c.name ?? "");
                    const stateColor =
                      c.state === "running"
                        ? "bg-emerald-100 text-emerald-800"
                        : c.state === "exited"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-800";
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900">{c.name ?? "—"}</div>
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          <span className="max-w-[200px] truncate block">{c.image ?? "—"}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${stateColor}`}>
                            {c.state ?? c.status ?? "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{formatPct(stats?.cpuPercent)}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {stats?.memPercent !== undefined
                            ? formatPct(stats.memPercent)
                            : `${formatBytes(stats?.memUsageBytes)} / ${formatBytes(stats?.memLimitBytes)}`}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          <span className="text-emerald-600">{formatBytes(stats?.netRxBytes)}</span>
                          {" / "}
                          <span className="text-blue-600">{formatBytes(stats?.netTxBytes)}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {formatBytes(stats?.blockReadBytes)} / {formatBytes(stats?.blockWriteBytes)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Top Processes</div>
              <div className="text-sm text-slate-500">Top 5 by CPU</div>
            </div>
          </div>

          {(() => {
            const list =
              latestSnap?.processesTop?.length
                ? latestSnap.processesTop
                : latestSnap?.processesTopCpu?.length
                  ? latestSnap.processesTopCpu
                  : null;

            if (list) {
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                      <tr>
                        <th className="px-5 py-3">PID</th>
                        <th className="px-5 py-3">Process</th>
                        <th className="px-5 py-3">CPU</th>
                        <th className="px-5 py-3">Memory</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-slate-600">{p.pid ?? "—"}</td>
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-900">{p.name ?? "—"}</div>
                          </td>
                          <td className="px-5 py-3 text-slate-600">{formatPct(typeof p.cpuPercent === "number" ? p.cpuPercent : 0)}</td>
                          <td className="px-5 py-3 text-slate-600">{formatPct(typeof p.memPercent === "number" ? p.memPercent : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            if (latestSnap?.topProcesses?.length) {
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
                      <tr>
                        <th className="px-5 py-3">PID</th>
                        <th className="px-5 py-3">Process</th>
                        <th className="px-5 py-3">CPU</th>
                        <th className="px-5 py-3">Memory</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {latestSnap.topProcesses.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-slate-600">{p.pid ?? "—"}</td>
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-900">{p.name ?? "—"}</div>
                          </td>
                          <td className="px-5 py-3 text-slate-600">{formatPct(p.cpu)}</td>
                          <td className="px-5 py-3 text-slate-600">{formatPct(p.mem)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            return (
              <div className="px-5 py-8 text-center text-sm text-slate-500">No process information available yet.</div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
