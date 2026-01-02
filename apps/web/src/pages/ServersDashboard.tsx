import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ServerDashboardResponse } from "../lib/api";
import { formatUptime } from "../lib/format";

function ServerIcon({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
        isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
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

function UptimeBar({ buckets }: { buckets: boolean[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {buckets.map((up, idx) => (
        <div
          key={idx}
          className={`h-6 w-1.5 rounded-full ${up ? "bg-emerald-500" : "bg-slate-200"}`}
          title={`${idx * 30}m - ${(idx + 1) * 30}m ago: ${up ? "Up" : "No data"}`}
        />
      ))}
    </div>
  );
}

export default function ServersDashboard() {
  const [data, setData] = useState<ServerDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api
      .serversDashboard(page, 20)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page]);

  const canPrev = page > 1;
  const canNext = data ? page < data.pagination.totalPages : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Servers</h1>
          <p className="text-sm text-slate-600">Monitor your server fleet</p>
        </div>
        <Link
          to="/servers/manage"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Manage Servers
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Total Servers</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{data?.summary.total ?? "—"}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Active Now</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600">{data?.summary.active ?? "—"}</span>
            {data && data.summary.total > 0 && (
              <span className="text-sm text-slate-500">
                / {data.summary.total}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Seen in last {Math.floor((data?.summary.activeWindowSeconds ?? 300) / 60)} min
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Offline</div>
          <div className="mt-2 text-3xl font-bold text-slate-400">
            {data ? data.summary.total - data.summary.active : "—"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">Server List</div>
            <div className="text-sm text-slate-500">Last 12 hours</div>
          </div>
        </div>

        {loading && !data ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Loading...</div>
        ) : null}

        {!loading && data?.servers.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            No servers yet. Add a server to get started.
          </div>
        ) : null}

        <div className="divide-y divide-slate-100">
          {data?.servers.map((server) => (
            <Link
              key={server.id}
              to={`/servers/${server.id}`}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <ServerIcon isActive={server.isActive} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{server.name}</span>
                  {server.isActive ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Online
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Offline
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-slate-500">
                  {server.ip ?? "No IP"} {server.vendor ? `• ${server.vendor}` : ""}
                </div>
              </div>

              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium text-slate-700">{formatUptime(server.uptimeMs)}</div>
                <div className="text-xs text-slate-500">uptime</div>
              </div>

              <div className="hidden lg:block">
                <UptimeBar buckets={server.buckets} />
              </div>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-slate-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          ))}
        </div>

        {data && data.pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
            <div className="text-sm text-slate-500">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={!canPrev}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
