import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type ServerAlertInfo } from "../lib/api";

type StatusFilter = "active" | "resolved" | "all";

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function AlertTypeBadge({ type }: { type: "cpu" | "ram" | "offline" }) {
  const styles: Record<string, string> = {
    cpu: "bg-neon-amber/10 text-neon-amber border-neon-amber/30",
    ram: "bg-neon-violet/10 text-neon-violet border-neon-violet/30",
    offline: "bg-slate-500/10 text-slate-400 border-slate-500/30"
  };
  const labels: Record<string, string> = {
    cpu: "CPU",
    ram: "RAM",
    offline: "Offline"
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: "active" | "resolved" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-rose/30 bg-neon-rose/10 px-2.5 py-0.5 text-xs font-medium text-neon-rose">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-rose" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-neon-emerald/30 bg-neon-emerald/10 px-2.5 py-0.5 text-xs font-medium text-neon-emerald">
      Resolved
    </span>
  );
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<ServerAlertInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const data = await api.alerts({ status: statusFilter, page, limit: 20 });
      setAlerts(data.alerts);
      setTotalPages(data.pagination.totalPages);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [statusFilter, page]);

  const handleResolve = async (alertId: string) => {
    setResolvingId(alertId);
    try {
      await api.resolveAlert(alertId);
      await fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve alert");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Alerts</h1>
          <p className="mt-1 text-sm text-slate-400">View and manage server alerts</p>
        </div>
        <div className="flex gap-2 rounded-lg border border-slate-700/50 bg-obsidian-800/40 p-1">
          {(["active", "resolved", "all"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={[
                "rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
                statusFilter === status
                  ? "bg-gradient-to-r from-neon-cyan to-neon-emerald text-obsidian-900 shadow-lg shadow-neon-cyan/20"
                  : "text-slate-400 hover:bg-obsidian-700/50 hover:text-white"
              ].join(" ")}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
        >
          {error}
        </motion.div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-700/50 bg-obsidian-800/40 shadow-xl backdrop-blur-sm">
        {loading && alerts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
            <p className="mt-3 text-sm text-slate-400">Loading alerts...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neon-emerald/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-neon-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-white">
              {statusFilter === "active" ? "No active alerts" : "No alerts found"}
            </p>
            <p className="mt-1 text-xs text-slate-400">All systems operating normally</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-obsidian-800/60 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-4">Server</th>
                  <th className="px-4 py-4">Type</th>
                  <th className="px-4 py-4">Threshold</th>
                  <th className="px-4 py-4">Actual</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Duration</th>
                  <th className="px-4 py-4">Triggered</th>
                  <th className="px-4 py-4">Notifs</th>
                  <th className="px-4 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {alerts.map((alert, idx) => (
                  <motion.tr
                    key={alert.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="transition-colors hover:bg-obsidian-700/30"
                  >
                    <td className="px-4 py-4">
                      <Link
                        to={`/servers/${alert.server.id}`}
                        className="font-medium text-white transition-colors hover:text-neon-cyan"
                      >
                        {alert.server.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <AlertTypeBadge type={alert.type} />
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-300">
                      {alert.thresholdValue !== null
                        ? alert.type === "offline"
                          ? `${alert.thresholdValue} min`
                          : `${alert.thresholdValue}%`
                        : "-"}
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-300">
                      {alert.actualValue !== null ? `${alert.actualValue}%` : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-300">{formatDuration(alert.duration)}</td>
                    <td className="px-4 py-4 text-slate-400">
                      {new Date(alert.triggeredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-obsidian-700/50 px-2 py-1 text-xs font-medium text-slate-300">
                        {alert.notificationCount}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {alert.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleResolve(alert.id)}
                          disabled={resolvingId === alert.id}
                          className="rounded-lg bg-neon-emerald/20 px-3 py-1.5 text-xs font-medium text-neon-emerald transition-all hover:bg-neon-emerald/30 disabled:opacity-50"
                        >
                          {resolvingId === alert.id ? "..." : "Resolve"}
                        </button>
                      )}
                      {alert.status === "resolved" && alert.resolvedBy && (
                        <span className="text-xs text-slate-500">
                          by {alert.resolvedBy.fullName}
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-700/50 bg-obsidian-800/60 px-4 py-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-400">
              Page <span className="font-medium text-white">{page}</span> of{" "}
              <span className="font-medium text-white">{totalPages}</span>
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
