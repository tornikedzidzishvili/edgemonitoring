import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type FailuresResponse } from "../lib/api";
import { formatDateTime, formatMs } from "../lib/format";

export default function Failures() {
  const [data, setData] = useState<FailuresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api
      .failures(page, 20)
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Failures</h1>
          <p className="text-sm text-slate-600">All failed endpoint checks</p>
        </div>
        <Link
          to="/"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to Dashboard
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="font-medium">Failure List</div>
          <div className="text-sm text-slate-500">Newest first</div>
        </div>

        {loading && !data ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Loading...</div>
        ) : null}

        {!loading && (data?.failures.length ?? 0) === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-sm font-medium text-slate-900">All systems operational</div>
            <div className="mt-1 text-sm text-slate-500">No failures found</div>
          </div>
        ) : null}

        <div className="divide-y divide-slate-100">
          {data?.failures.map((f, idx) => (
            <motion.div
              key={`${f.webAppId}-${f.checkedAt}-${idx}`}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
            >
              <div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 sm:flex">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className="font-medium text-slate-900">{f.webAppName}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(f.checkedAt)}</span>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 sm:hidden" />
                    HTTP {f.httpStatus ?? "—"}
                  </span>
                  <span>{formatMs(f.responseTimeMs ?? null)}</span>
                </div>

                {f.error ? (
                  <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{f.error}</div>
                ) : null}
              </div>
            </motion.div>
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
