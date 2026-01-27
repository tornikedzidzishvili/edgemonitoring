import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type FailuresResponse } from "../lib/api";
import { formatDateTime, formatFailureError, formatMs } from "../lib/format";

export default function Failures() {
  const [data, setData] = useState<FailuresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState(false);

  const loadFailures = () => {
    setLoading(true);
    api
      .failures(page, 20)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFailures();
  }, [page]);

  const handleClearFailures = async () => {
    if (!confirm("Are you sure you want to clear all failures? This action cannot be undone.")) {
      return;
    }

    setClearing(true);
    try {
      await api.clearFailures();
      setPage(1);
      loadFailures();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear failures");
    } finally {
      setClearing(false);
    }
  };

  const canPrev = page > 1;
  const canNext = data ? page < data.pagination.totalPages : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Failures</h1>
          <p className="mt-1 text-sm text-slate-400">All failed endpoint checks</p>
        </div>
        <div className="flex gap-2">
          {data && data.pagination.total > 0 && (
            <button
              type="button"
              onClick={handleClearFailures}
              disabled={clearing}
              className="flex items-center gap-2 rounded-lg border border-neon-rose/50 bg-neon-rose/10 px-4 py-2.5 text-sm font-medium text-neon-rose transition-all hover:bg-neon-rose/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-rose border-t-transparent" />
                  Clearing...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="m19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear All
                </>
              )}
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-obsidian-800/40 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Dashboard
          </Link>
        </div>
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

      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 shadow-xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-rose/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-rose" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <span className="font-medium text-white">Failure List</span>
          </div>
          <span className="text-sm text-slate-400">Newest first</span>
        </div>

        {loading && !data ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
            <p className="mt-3 text-sm text-slate-400">Loading failures...</p>
          </div>
        ) : null}

        {!loading && (data?.failures.length ?? 0) === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neon-emerald/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-neon-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="mt-4 text-base font-medium text-white">All systems operational</div>
            <div className="mt-1 text-sm text-slate-400">No failures found</div>
          </div>
        ) : null}

        <div className="divide-y divide-slate-700/30">
          {data?.failures.map((f, idx) => (
            <motion.div
              key={`${f.webAppId}-${f.checkedAt}-${idx}`}
              className="flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-obsidian-700/20 sm:flex-row sm:items-start sm:gap-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
            >
              <div className="hidden h-10 w-10 items-center justify-center rounded-lg bg-neon-rose/10 sm:flex">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-rose" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className="font-medium text-white">{f.webAppName}</span>
                  <span className="font-mono text-xs text-slate-400">{formatDateTime(f.checkedAt)}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-neon-rose sm:hidden" />
                    <span className="rounded bg-obsidian-700/50 px-2 py-0.5 font-mono text-xs">
                      HTTP {f.httpStatus ?? "—"}
                    </span>
                  </span>
                  <span className="font-mono text-slate-400">{formatMs(f.responseTimeMs ?? null)}</span>
                </div>

                {f.error ? (
                  <div
                    className="mt-3 rounded-lg border border-neon-rose/20 bg-neon-rose/5 px-4 py-3 font-mono text-xs text-neon-rose/80"
                    title={f.error}
                  >
                    {formatFailureError(f.error)}
                  </div>
                ) : null}
              </div>
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
