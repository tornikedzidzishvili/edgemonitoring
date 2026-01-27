import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type ServerDashboardResponse } from "../lib/api";
import { formatUptime } from "../lib/format";

function ServerIcon({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-xl ${
        isActive
          ? "bg-neon-emerald/10 text-neon-emerald"
          : "bg-slate-500/10 text-slate-500"
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
          className={`h-7 w-1.5 rounded-full transition-all ${
            up
              ? "bg-neon-emerald shadow-sm shadow-neon-emerald/30"
              : "bg-slate-700/50"
          }`}
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Servers</h1>
          <p className="mt-1 text-sm text-slate-400">Monitor your server fleet</p>
        </div>
        <Link
          to="/servers/manage"
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-4 py-2.5 text-sm font-medium text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Manage Servers
        </Link>
      </div>

      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
        >
          {error}
        </motion.div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-cyan/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">Total Servers</span>
          </div>
          <div className="mt-4 text-4xl font-bold text-white">{data?.summary.total ?? "—"}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-emerald/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">Active Now</span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-neon-emerald">{data?.summary.active ?? "—"}</span>
            {data && data.summary.total > 0 && (
              <span className="text-sm text-slate-500">
                / {data.summary.total}
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Seen in last {Math.floor((data?.summary.activeWindowSeconds ?? 300) / 60)} min
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-500/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">Offline</span>
          </div>
          <div className="mt-4 text-4xl font-bold text-slate-500">
            {data ? data.summary.total - data.summary.active : "—"}
          </div>
        </motion.div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 shadow-xl backdrop-blur-sm">
        <div className="border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </div>
              <span className="font-medium text-white">Server List</span>
            </div>
            <span className="text-sm text-slate-400">Last 12 hours</span>
          </div>
        </div>

        {loading && !data ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
            <p className="mt-3 text-sm text-slate-400">Loading servers...</p>
          </div>
        ) : null}

        {!loading && data?.servers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-500/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <div className="mt-4 text-base font-medium text-white">No servers yet</div>
            <div className="mt-1 text-sm text-slate-400">Add a server to get started</div>
          </div>
        ) : null}

        <div className="divide-y divide-slate-700/30">
          {data?.servers.map((server, idx) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              <Link
                to={`/servers/${server.id}`}
                className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-obsidian-700/30"
              >
                <ServerIcon isActive={server.isActive} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{server.name}</span>
                    {server.isActive ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-emerald/30 bg-neon-emerald/10 px-2.5 py-0.5 text-xs font-medium text-neon-emerald">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-emerald" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                        Offline
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    <span className="font-mono">{server.ip ?? "No IP"}</span>
                    {server.vendor ? <span> • {server.vendor}</span> : ""}
                  </div>
                </div>

                <div className="hidden text-right sm:block">
                  <div className="text-sm font-medium text-white">{formatUptime(server.uptimeMs)}</div>
                  <div className="text-xs text-slate-500">uptime</div>
                </div>

                <div className="hidden lg:block">
                  <UptimeBar buckets={server.buckets} />
                </div>

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-slate-500"
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
            </motion.div>
          ))}
        </div>

        {data && data.pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-700/50 px-6 py-4">
            <div className="text-sm text-slate-400">
              Page <span className="font-medium text-white">{data.pagination.page}</span> of{" "}
              <span className="font-medium text-white">{data.pagination.totalPages}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={!canPrev}
                className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext}
                className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
