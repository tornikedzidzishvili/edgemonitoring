import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE_URL, api, type ServerDetail, type ServerEndpoint, type ServerMetricsPoint } from "../lib/api";
import { formatDateTime, formatUptime, formatPct as formatPctLib, formatMs } from "../lib/format";
import InstallAgentModal from "../components/InstallAgentModal";

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
        isActive ? "bg-neon-emerald/10 text-neon-emerald" : "bg-slate-500/10 text-slate-500"
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
    connecting: "border-neon-amber/30 bg-neon-amber/10 text-neon-amber",
    open: "border-neon-emerald/30 bg-neon-emerald/10 text-neon-emerald",
    reconnecting: "border-neon-amber/30 bg-neon-amber/10 text-neon-amber",
    closed: "border-slate-500/30 bg-slate-500/10 text-slate-400"
  };
  const labels = {
    connecting: "Connecting",
    open: "Live",
    reconnecting: "Reconnecting",
    closed: "Disconnected"
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {status === "open" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-emerald" />}
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
            status === true ? "bg-neon-emerald shadow-sm shadow-neon-emerald/30" : status === false ? "bg-neon-rose shadow-sm shadow-neon-rose/30" : "bg-slate-700/50"
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
  // Agent's system.mem.used actually represents available (free-ish) bytes; invert to true used.
  // Same convention is applied in serverAlertScheduler.ts (see commit d965bc3).
  const rawMemUsed = typeof system?.mem?.used === "number" ? system.mem.used : undefined;
  const memUsed =
    typeof rawMemUsed === "number" && typeof memTotal === "number" ? Math.max(0, memTotal - rawMemUsed) : undefined;
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
  return { cpuLoad, memUsed, memTotal, disk, processesTop, processesTopCpu, processesTopMem, topProcesses, containers, containerStats, dockerError };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-obsidian-800/90 px-3 py-2 shadow-xl backdrop-blur-sm">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="font-mono text-sm font-medium text-white">
          {typeof payload[0].value === "number" ? `${payload[0].value.toFixed(1)}%` : "—"}
        </p>
      </div>
    );
  }
  return null;
};

export default function ServerDetailPage() {
  const { id } = useParams();
  const serverId = id ?? "";

  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"connecting" | "open" | "reconnecting" | "closed">("connecting");
  const [showInstallModal, setShowInstallModal] = useState(false);

  const [live, setLive] = useState<LivePoint[]>([]);
  const lastReportedAtRef = useRef<string | null>(null);

  const [metricsDays, setMetricsDays] = useState<1 | 5 | 15 | 30>(1);
  const [metricsStepMinutes, setMetricsStepMinutes] = useState<5 | 15 | 30 | 60>(60);
  const [metrics, setMetrics] = useState<ServerMetricsPoint[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    const recommended: 5 | 15 | 30 | 60 = metricsDays === 1 ? 60 : metricsDays === 5 ? 5 : metricsDays === 15 ? 15 : 60;
    setMetricsStepMinutes(recommended);
  }, [metricsDays]);

  const [endpoints, setEndpoints] = useState<ServerEndpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(true);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [savingEndpoint, setSavingEndpoint] = useState(false);

  const [editingEndpoint, setEditingEndpoint] = useState<string | null>(null);
  const [editEndpointName, setEditEndpointName] = useState("");
  const [editEndpointUrl, setEditEndpointUrl] = useState("");
  const [updatingEndpoint, setUpdatingEndpoint] = useState(false);

  const [deletingEndpoint, setDeletingEndpoint] = useState<string | null>(null);

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

  useEffect(() => {
    if (!serverId) return;
    setEndpointsLoading(true);
    api
      .serverEndpoints(serverId)
      .then((res) => setEndpoints(res.endpoints))
      .catch(() => {})
      .finally(() => setEndpointsLoading(false));
  }, [serverId]);

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
    const poll = setInterval(() => { load().catch(() => {}); }, 60 * 1000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [serverId, metricsDays, metricsStepMinutes]);

  useEffect(() => {
    if (!serverId) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1000;
    // When true, the cleanup function has run — don't start another cycle.
    let unmounted = false;

    function attachReportHandler(source: EventSource) {
      source.addEventListener("report", (evt) => {
        try {
          const msg = JSON.parse((evt as MessageEvent).data) as {
            reportedAt: string;
            payload: unknown;
            server?: { name?: string };
          };
          if (!msg?.reportedAt) return;
          if (lastReportedAtRef.current && msg.reportedAt <= lastReportedAtRef.current) return;
          lastReportedAtRef.current = msg.reportedAt;
          const snap = parseAgentSnapshot(msg.payload);
          setDetail((prev) =>
            prev
              ? { ...prev, name: msg?.server?.name ?? prev.name, latestReport: { reportedAt: msg.reportedAt, payload: msg.payload } }
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
        } catch {}
      });
    }

    async function connect() {
      if (unmounted) return;
      setConnection("connecting");
      try {
        const { ticket } = await api.serverStreamTicket(serverId);
        if (unmounted) return;
        const url = `${API_BASE_URL}/servers/${encodeURIComponent(serverId)}/stream?ticket=${encodeURIComponent(ticket)}`;
        const source = new EventSource(url);
        es = source;
        source.onopen = () => {
          if (unmounted) { source.close(); return; }
          backoffMs = 1000; // reset on successful open
          setConnection("open");
        };
        source.onerror = () => {
          // Close immediately so the browser doesn't retry the now-consumed ticket.
          source.close();
          es = null;
          if (unmounted) return;
          setConnection("reconnecting");
          reconnectTimer = setTimeout(() => {
            backoffMs = Math.min(backoffMs * 2, 10000);
            connect().catch(() => {});
          }, backoffMs);
        };
        attachReportHandler(source);
      } catch {
        // Ticket fetch failed (401 = session gone, 404 = server deleted). Stop retrying.
        if (!unmounted) setConnection("closed");
      }
    }

    connect().catch(() => {});

    return () => {
      unmounted = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (es !== null) { es.close(); es = null; }
      setConnection("closed");
    };
  }, [serverId]);

  const latestSnap = useMemo(() => parseAgentSnapshot(detail?.latestReport?.payload ?? null), [detail?.latestReport?.payload]);
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

  const cpuSeries = useMemo(() => metrics.map((p) => ({ t: p.t, cpu: p.cpuLoad })), [metrics]);
  const memSeries = useMemo(
    () => metrics.map((p) => ({ t: p.t, mem: typeof p.memUsedPct === "number" ? 100 - p.memUsedPct : p.memUsedPct })),
    [metrics]
  );

  const isActive = detail?.lastSeenAt ? Date.now() - new Date(detail.lastSeenAt).getTime() < 5 * 60 * 1000 : false;
  const uptimeMs = detail?.createdAt ? Date.now() - new Date(detail.createdAt).getTime() : 0;
  const isSSH = detail?.monitoringMode === "ssh";
  const isAgentSystemd = detail?.monitoringMode === "agent_systemd";
  const sshStale = isSSH && (
    !detail?.lastSeenAt || Date.now() - new Date(detail.lastSeenAt).getTime() > 3 * 60 * 1000
  );

  async function handleAddEndpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!serverId) return;
    setSavingEndpoint(true);
    try {
      await api.adminCreateWebapp({ name: endpointName, url: endpointUrl, serverId });
      setEndpointName("");
      setEndpointUrl("");
      setShowAddEndpoint(false);
      const res = await api.serverEndpoints(serverId);
      setEndpoints(res.endpoints);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add endpoint");
    } finally {
      setSavingEndpoint(false);
    }
  }

  function handleStartEdit(endpoint: ServerEndpoint) {
    setEditingEndpoint(endpoint.id);
    setEditEndpointName(endpoint.name);
    setEditEndpointUrl(endpoint.url);
    setExpandedEndpoint(endpoint.id);
  }

  function handleCancelEdit() {
    setEditingEndpoint(null);
    setEditEndpointName("");
    setEditEndpointUrl("");
  }

  async function handleUpdateEndpoint(e: React.FormEvent, endpointId: string) {
    e.preventDefault();
    if (!serverId) return;
    setUpdatingEndpoint(true);
    try {
      await api.adminUpdateWebapp({ id: endpointId, name: editEndpointName, url: editEndpointUrl });
      setEditingEndpoint(null);
      setEditEndpointName("");
      setEditEndpointUrl("");
      const res = await api.serverEndpoints(serverId);
      setEndpoints(res.endpoints);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update endpoint");
    } finally {
      setUpdatingEndpoint(false);
    }
  }

  async function handleDeleteEndpoint(endpointId: string) {
    if (!serverId) return;
    if (!confirm("Are you sure you want to delete this endpoint?")) return;
    setDeletingEndpoint(endpointId);
    try {
      await api.adminDeleteWebapp({ id: endpointId });
      const res = await api.serverEndpoints(serverId);
      setEndpoints(res.endpoints);
      if (expandedEndpoint === endpointId) setExpandedEndpoint(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete endpoint");
    } finally {
      setDeletingEndpoint(null);
    }
  }

  if (!serverId) return null;

  const inputClasses = "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-3 py-2 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm">
        <div className="mb-3 flex sm:hidden">
          <Link to="/servers" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Servers
          </Link>
        </div>
        <div className="flex items-start gap-4">
          <ServerIcon isActive={isActive} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-lg font-display font-semibold text-white sm:text-xl">{detail?.name ?? "Loading..."}</h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-emerald/30 bg-neon-emerald/10 px-2.5 py-0.5 text-xs font-medium text-neon-emerald">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-emerald" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                  Offline
                </span>
              )}
              <ConnectionBadge status={connection} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400 sm:gap-x-4">
              {detail?.ip && <span className="font-mono">{detail.ip}</span>}
              {detail?.vendor && <span>{detail.vendor}</span>}
              <span>Uptime: {formatUptime(uptimeMs)}</span>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {isSSH ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-400 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                SSH Polling
              </span>
            ) : isAgentSystemd ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-400 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
                Linux Agent
              </span>
            ) : (
              (() => {
                const canInstall = !!(detail?.ip && detail?.sshKeyId);
                return (
                  <button
                    type="button"
                    onClick={() => canInstall && setShowInstallModal(true)}
                    disabled={!canInstall}
                    title={!canInstall ? "Requires IP and an SSH key to be set on this server" : "Install monitoring agent via SSH"}
                    className="rounded-lg border border-neon-amber/30 bg-neon-amber/10 px-4 py-2 text-sm font-medium text-neon-amber transition-all hover:bg-neon-amber/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Install agent
                  </button>
                );
              })()
            )}
            <Link to="/servers" className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white">
              Back to Servers
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose">
          {error}
        </motion.div>
      ) : null}

      {sshStale ? (
        <div className="rounded-xl border border-neon-amber/30 bg-neon-amber/10 p-5 backdrop-blur-sm dark:border-neon-amber/30 dark:bg-neon-amber/10">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neon-amber/20 text-neon-amber dark:bg-neon-amber/20 dark:text-neon-amber">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-neon-amber dark:text-neon-amber">No recent data — SSH polling may be failing</div>
              <div className="mt-1 text-sm text-slate-400 dark:text-slate-400">
                No report received in the last 3 minutes. Check SSH connectivity and polling configuration for this server.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CPU Load */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-cyan/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">CPU Load</span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{latestSnap?.cpuLoad !== undefined ? `${latestSnap.cpuLoad.toFixed(1)}%` : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">Current load average</div>
        </motion.div>

        {/* Memory */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-violet/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M6 8v-3M10 8v-3M14 8v-3M18 8v-3" />
                <rect x="3" y="8" width="18" height="8" rx="1" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">Memory</span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{latestSnap?.memUsed !== undefined && latestSnap?.memTotal !== undefined && latestSnap.memTotal > 0 ? `${((latestSnap.memUsed / latestSnap.memTotal) * 100).toFixed(1)}%` : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">{formatBytes(latestSnap?.memUsed)} / {formatBytes(latestSnap?.memTotal)}</div>
        </motion.div>

        {/* Endpoints */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-emerald/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">Endpoints</span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{endpoints.length}</div>
          <div className="mt-1 text-xs text-slate-500">{endpoints.filter((e) => e.lastCheck?.ok).length} up</div>
        </motion.div>

        {/* Containers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-amber/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h7.5" />
                <path d="M18 14v4h4M18 18l4 4" />
                <path d="M6 8h.01M10 8h.01M14 8h.01" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">Containers</span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{latestSnap?.containers?.length ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">{monitorDocker ? "Docker monitoring enabled" : "Docker monitoring disabled"}</div>
        </motion.div>
      </div>

      {/* HTTP Endpoints Section */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
        <div className="flex flex-col gap-3 border-b border-slate-700/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium text-white">HTTP Endpoints</div>
            <div className="text-xs text-slate-400">Monitor URLs and services running on this server</div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddEndpoint(!showAddEndpoint)}
            className="w-full rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-4 py-2 text-sm font-medium text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 sm:w-auto"
          >
            {showAddEndpoint ? "Cancel" : "Add Endpoint"}
          </button>
        </div>

        {showAddEndpoint && (
          <form onSubmit={handleAddEndpoint} className="border-b border-slate-700/50 bg-obsidian-800/60 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-400">Name</label>
                <input type="text" value={endpointName} onChange={(e) => setEndpointName(e.target.value)} placeholder="API Health" required className={inputClasses + " mt-1.5"} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400">URL</label>
                <input type="text" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://api.example.com/health" required className={inputClasses + " mt-1.5"} />
              </div>
            </div>
            <div className="mt-3">
              <button type="submit" disabled={savingEndpoint} className="rounded-lg bg-neon-emerald/20 px-4 py-2 text-sm font-medium text-neon-emerald transition-all hover:bg-neon-emerald/30 disabled:opacity-50">
                {savingEndpoint ? "Adding..." : "Add Endpoint"}
              </button>
            </div>
          </form>
        )}

        {endpointsLoading ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
            <p className="mt-3 text-sm text-slate-400">Loading endpoints...</p>
          </div>
        ) : endpoints.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No endpoints configured. Add an endpoint to monitor URLs on this server.
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id}>
                <div className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-obsidian-700/30" onClick={() => setExpandedEndpoint(expandedEndpoint === endpoint.id ? null : endpoint.id)}>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${endpoint.lastCheck?.ok === true ? "bg-neon-emerald/10 text-neon-emerald" : endpoint.lastCheck?.ok === false ? "bg-neon-rose/10 text-neon-rose" : "bg-slate-500/10 text-slate-400"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{endpoint.name}</span>
                      {endpoint.lastCheck?.ok === true && <span className="inline-flex items-center rounded-full border border-neon-emerald/30 bg-neon-emerald/10 px-2 py-0.5 text-xs font-medium text-neon-emerald">Up</span>}
                      {endpoint.lastCheck?.ok === false && <span className="inline-flex items-center rounded-full border border-neon-rose/30 bg-neon-rose/10 px-2 py-0.5 text-xs font-medium text-neon-rose">Down</span>}
                      {endpoint.lastCheck === null && <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400">No data</span>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-sm text-slate-400">{endpoint.url}</div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-medium text-white">{endpoint.uptime24h !== null ? `${(endpoint.uptime24h * 100).toFixed(1)}%` : "—"}</div>
                    <div className="text-xs text-slate-500">24h uptime</div>
                  </div>
                  <div className="hidden lg:block"><EndpointUptimeBar buckets={endpoint.buckets} /></div>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-400 transition-transform ${expandedEndpoint === endpoint.id ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                {expandedEndpoint === endpoint.id && (
                  <div className="border-t border-slate-700/30 bg-obsidian-800/60 px-5 py-4">
                    {editingEndpoint === endpoint.id ? (
                      <form onSubmit={(e) => handleUpdateEndpoint(e, endpoint.id)} className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-400">Name</label>
                            <input type="text" value={editEndpointName} onChange={(e) => setEditEndpointName(e.target.value)} placeholder="Endpoint name" required className={inputClasses + " mt-1.5"} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-400">URL</label>
                            <input type="text" value={editEndpointUrl} onChange={(e) => setEditEndpointUrl(e.target.value)} placeholder="https://example.com/health" required className={inputClasses + " mt-1.5"} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" disabled={updatingEndpoint} className="rounded-lg bg-neon-emerald/20 px-4 py-2 text-sm font-medium text-neon-emerald transition-all hover:bg-neon-emerald/30 disabled:opacity-50">
                            {updatingEndpoint ? "Updating..." : "Update Endpoint"}
                          </button>
                          <button type="button" onClick={handleCancelEdit} className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white">
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          {[
                            { label: "Last Check", value: formatDateTime(endpoint.lastCheck?.checkedAt) },
                            { label: "HTTP Status", value: endpoint.lastCheck?.httpStatus ?? "—" },
                            { label: "Response Time", value: formatMs(endpoint.lastCheck?.responseTimeMs ?? null) },
                            { label: "24h Uptime", value: formatPctLib(endpoint.uptime24h) }
                          ].map((item) => (
                            <div key={item.label}>
                              <div className="text-xs font-medium text-slate-400">{item.label}</div>
                              <div className="mt-1 text-sm text-white">{item.value}</div>
                            </div>
                          ))}
                        </div>
                        {endpoint.lastCheck?.error && (
                          <div className="mt-3 rounded-lg border border-neon-rose/20 bg-neon-rose/5 px-4 py-3 font-mono text-xs text-neon-rose/80">
                            Error: {endpoint.lastCheck.error}
                          </div>
                        )}
                        <div className="mt-3 lg:hidden">
                          <div className="mb-2 text-xs font-medium text-slate-400">Last 12 hours</div>
                          <EndpointUptimeBar buckets={endpoint.buckets} />
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button type="button" onClick={() => handleStartEdit(endpoint)} className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white">
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDeleteEndpoint(endpoint.id)} disabled={deletingEndpoint === endpoint.id} className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-2 text-sm font-medium text-neon-rose transition-all hover:bg-neon-rose/20 disabled:opacity-50">
                            {deletingEndpoint === endpoint.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!detail?.latestReport && !isSSH ? (
        <div className="rounded-xl border border-neon-amber/30 bg-neon-amber/10 p-5 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-amber/20 text-neon-amber">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-neon-amber">No realtime stats yet</div>
              <div className="mt-1 text-sm text-slate-400">
                CPU/memory/disk/docker stats come from the agent. Go to{" "}
                <Link to="/servers/manage" className="font-medium text-neon-cyan hover:underline">Manage Servers</Link>{" "}
                to generate an agent key, then run the agent on this server.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Charts Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-obsidian-800/40 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="font-medium text-white">Metrics</div>
          <div className="text-xs text-slate-400">{metricsLoading ? "Loading..." : `${metrics.length} points`} • {metricsDays}d • {metricsStepMinutes}m step</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span>Range</span>
            <select value={metricsDays} onChange={(e) => setMetricsDays(Number(e.target.value) as 1 | 5 | 15 | 30)} className="rounded-lg border border-slate-700/50 bg-obsidian-800 py-1 pl-2 pr-8 text-xs text-white">
              <option value={1}>1 day</option>
              <option value={5}>5 days</option>
              <option value={15}>15 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span>Interval</span>
            <select value={metricsStepMinutes} onChange={(e) => setMetricsStepMinutes(Number(e.target.value) as 5 | 15 | 30 | 60)} className="rounded-lg border border-slate-700/50 bg-obsidian-800 py-1 pl-2 pr-8 text-xs text-white">
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
          <div className="border-b border-slate-700/50 px-5 py-4">
            <div className="font-medium text-white">CPU Load</div>
          </div>
          <div className="p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpuSeries}>
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={32} tickFormatter={(v) => { const d = new Date(String(v)); return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v); }} />
                  <YAxis width={40} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="cpu" strokeWidth={2} dot={false} stroke="#22d3ee" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
          <div className="border-b border-slate-700/50 px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-medium text-white">Memory Usage</div>
              <div className="text-xs text-slate-400">{formatBytes(latestSnap?.memUsed)} / {formatBytes(latestSnap?.memTotal)}</div>
            </div>
          </div>
          <div className="p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={memSeries}>
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={32} tickFormatter={(v) => { const d = new Date(String(v)); return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v); }} />
                  <YAxis width={40} domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="mem" strokeWidth={2} dot={false} stroke="#a78bfa" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Disk */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
        <div className="border-b border-slate-700/50 px-5 py-4">
          <div className="font-medium text-white">Disk Usage</div>
        </div>
        {!latestSnap?.disk?.length ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No disk information available yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-obsidian-800/60 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3">Mount Point</th>
                  <th className="px-5 py-3">Used</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Available</th>
                  <th className="px-5 py-3">Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {latestSnap.disk.map((d, idx) => {
                  const usagePct = d.size && d.used ? (d.used / d.size) * 100 : 0;
                  return (
                    <tr key={idx} className="transition-colors hover:bg-obsidian-700/30">
                      <td className="px-5 py-3 font-medium text-white">{d.mount ?? "—"}</td>
                      <td className="px-5 py-3 font-mono text-slate-300">{formatBytes(d.used)}</td>
                      <td className="px-5 py-3 font-mono text-slate-300">{formatBytes(d.size)}</td>
                      <td className="px-5 py-3 font-mono text-slate-300">{formatBytes(d.available)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-700/50">
                            <div className={`h-full rounded-full ${usagePct > 90 ? "bg-neon-rose" : usagePct > 70 ? "bg-neon-amber" : "bg-neon-emerald"}`} style={{ width: `${Math.min(usagePct, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs text-slate-400">{usagePct.toFixed(1)}%</span>
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

      {/* Docker Containers or Processes */}
      {monitorDocker ? (
        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
          <div className="border-b border-slate-700/50 px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-medium text-white">Docker Containers</div>
              <div className="text-sm text-slate-400">{latestSnap?.containers?.length ?? 0} containers</div>
            </div>
          </div>
          {latestSnap?.dockerError ? (
            <div className="px-5 py-4">
              <div className="rounded-lg border border-neon-rose/20 bg-neon-rose/5 px-4 py-3 font-mono text-sm text-neon-rose/80">
                Docker error: {latestSnap.dockerError}
              </div>
            </div>
          ) : !latestSnap?.containers?.length ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No containers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700/50 bg-obsidian-800/60 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
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
                <tbody className="divide-y divide-slate-700/30">
                  {latestSnap.containers.map((c, idx) => {
                    const stats = statsByName.get(c.name ?? "");
                    const stateStyle = c.state === "running" ? "border-neon-emerald/30 bg-neon-emerald/10 text-neon-emerald" : c.state === "exited" ? "border-slate-500/30 bg-slate-500/10 text-slate-400" : "border-neon-amber/30 bg-neon-amber/10 text-neon-amber";
                    return (
                      <tr key={idx} className="transition-colors hover:bg-obsidian-700/30">
                        <td className="px-5 py-3 font-medium text-white">{c.name ?? "—"}</td>
                        <td className="px-5 py-3 text-slate-300"><span className="block max-w-[200px] truncate font-mono text-xs">{c.image ?? "—"}</span></td>
                        <td className="px-5 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${stateStyle}`}>{c.state ?? c.status ?? "—"}</span></td>
                        <td className="px-5 py-3 font-mono text-slate-300">{formatPct(stats?.cpuPercent)}</td>
                        <td className="px-5 py-3 font-mono text-slate-300">{stats?.memPercent !== undefined ? formatPct(stats.memPercent) : `${formatBytes(stats?.memUsageBytes)} / ${formatBytes(stats?.memLimitBytes)}`}</td>
                        <td className="px-5 py-3 font-mono"><span className="text-neon-emerald">{formatBytes(stats?.netRxBytes)}</span>{" / "}<span className="text-neon-cyan">{formatBytes(stats?.netTxBytes)}</span></td>
                        <td className="px-5 py-3 font-mono text-slate-300">{formatBytes(stats?.blockReadBytes)} / {formatBytes(stats?.blockWriteBytes)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
          <div className="border-b border-slate-700/50 px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-medium text-white">Top Processes</div>
              <div className="text-sm text-slate-400">Top 5 by CPU</div>
            </div>
          </div>
          {(() => {
            const list = latestSnap?.processesTop?.length ? latestSnap.processesTop : latestSnap?.processesTopCpu?.length ? latestSnap.processesTopCpu : null;
            if (list) {
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-700/50 bg-obsidian-800/60 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-5 py-3">PID</th>
                        <th className="px-5 py-3">Process</th>
                        <th className="px-5 py-3">CPU</th>
                        <th className="px-5 py-3">Memory</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {list.map((p, idx) => (
                        <tr key={idx} className="transition-colors hover:bg-obsidian-700/30">
                          <td className="px-5 py-3 font-mono text-slate-400">{p.pid ?? "—"}</td>
                          <td className="px-5 py-3 font-medium text-white">{p.name ?? "—"}</td>
                          <td className="px-5 py-3 font-mono text-slate-300">{formatPct(typeof p.cpuPercent === "number" ? p.cpuPercent : 0)}</td>
                          <td className="px-5 py-3 font-mono text-slate-300">{formatPct(typeof p.memPercent === "number" ? p.memPercent : 0)}</td>
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
                    <thead className="border-b border-slate-700/50 bg-obsidian-800/60 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-5 py-3">PID</th>
                        <th className="px-5 py-3">Process</th>
                        <th className="px-5 py-3">CPU</th>
                        <th className="px-5 py-3">Memory</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {latestSnap.topProcesses.map((p, idx) => (
                        <tr key={idx} className="transition-colors hover:bg-obsidian-700/30">
                          <td className="px-5 py-3 font-mono text-slate-400">{p.pid ?? "—"}</td>
                          <td className="px-5 py-3 font-medium text-white">{p.name ?? "—"}</td>
                          <td className="px-5 py-3 font-mono text-slate-300">{formatPct(p.cpu)}</td>
                          <td className="px-5 py-3 font-mono text-slate-300">{formatPct(p.mem)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return <div className="px-5 py-8 text-center text-sm text-slate-400">No process information available yet.</div>;
          })()}
        </div>
      )}

      {showInstallModal && detail && !isSSH && !isAgentSystemd ? (
        <InstallAgentModal
          serverId={serverId}
          serverName={detail.name}
          onSuccess={() => {
            api.server(serverId).then(setDetail).catch(() => {});
          }}
          onClose={() => setShowInstallModal(false)}
        />
      ) : null}
    </motion.div>
  );
}
