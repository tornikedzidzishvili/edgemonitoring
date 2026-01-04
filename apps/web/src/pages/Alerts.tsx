import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const colors: Record<string, string> = {
    cpu: "bg-orange-100 text-orange-800",
    ram: "bg-purple-100 text-purple-800",
    offline: "bg-slate-100 text-slate-800"
  };
  const labels: Record<string, string> = {
    cpu: "CPU",
    ram: "RAM",
    offline: "Offline"
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[type]}`}>
      {labels[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: "active" | "resolved" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
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
    // Auto-refresh every 30 seconds
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
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">View and manage server alerts</p>
        </div>
        <div className="flex gap-2">
          {(["active", "resolved", "all"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                statusFilter === status
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              ].join(" ")}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading && alerts.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            {statusFilter === "active" ? "No active alerts" : "No alerts found"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Server</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Threshold</th>
                  <th className="px-4 py-3">Actual</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Triggered</th>
                  <th className="px-4 py-3">Notifications</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/servers/${alert.server.id}`}
                        className="font-medium text-slate-900 hover:text-slate-700 hover:underline"
                      >
                        {alert.server.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <AlertTypeBadge type={alert.type} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {alert.thresholdValue !== null
                        ? alert.type === "offline"
                          ? `${alert.thresholdValue} min`
                          : `${alert.thresholdValue}%`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {alert.actualValue !== null ? `${alert.actualValue}%` : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(alert.duration)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(alert.triggeredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{alert.notificationCount}</td>
                    <td className="px-4 py-3">
                      {alert.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleResolve(alert.id)}
                          disabled={resolvingId === alert.id}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
