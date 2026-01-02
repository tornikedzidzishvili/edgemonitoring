import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type DashboardRange, type DashboardResponse } from "../lib/api";
import { formatDateTime, formatMs } from "../lib/format";

function formatCompactTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ServerIcon({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
        isActive ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
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

export default function Dashboard() {
  const [range, setRange] = useState<DashboardRange>("24h");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);

  async function refresh(nextRange: DashboardRange = range) {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const res = await api.dashboard(nextRange);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }

  useEffect(() => {
    refresh(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    const t = setInterval(() => {
      refresh(range);
    }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const series = useMemo(() => {
    const raw = data?.uptimeSeries ?? [];
    return raw.map((p) => ({
      t: formatCompactTime(p.bucketStart),
      okPct: p.okPct === null ? null : Math.round(p.okPct * 1000) / 10,
      totalCount: p.totalCount,
      okCount: p.okCount
    }));
  }, [data?.uptimeSeries]);

  const recentServers = useMemo(() => data?.servers.recent ?? [], [data?.servers.recent]);
  const recentFailures = useMemo(() => data?.recentFailures ?? [], [data?.recentFailures]);

  // Calculate overall health percentage
  const healthPct = useMemo(() => {
    if (!data) return null;
    const total = data.webapps.up + data.webapps.down;
    if (total === 0) return null;
    return Math.round((data.webapps.up / total) * 100);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-600">Overview of your infrastructure</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Updated {formatDateTime(data?.generatedAt)}
          </div>
          <select
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            aria-label="Time range"
            value={range}
            onChange={(e) => setRange(e.target.value as DashboardRange)}
          >
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={loading}
            onClick={() => refresh(range)}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-600">Servers</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 7H7v6h6V7z" />
                <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{data?.servers.total ?? "—"}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="text-emerald-600 font-medium">{data?.servers.active ?? 0}</span> active now
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-600">Endpoints</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{data?.webapps.total ?? "—"}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">HTTP endpoints monitored</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-600">Health</div>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              healthPct === null ? "bg-slate-100 text-slate-400" :
              healthPct >= 95 ? "bg-emerald-100 text-emerald-600" :
              healthPct >= 80 ? "bg-amber-100 text-amber-600" :
              "bg-rose-100 text-rose-600"
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${
              healthPct === null ? "text-slate-400" :
              healthPct >= 95 ? "text-emerald-600" :
              healthPct >= 80 ? "text-amber-600" :
              "text-rose-600"
            }`}>
              {healthPct !== null ? `${healthPct}%` : "—"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="text-emerald-600 font-medium">{data?.webapps.up ?? 0}</span> up, <span className="text-rose-600 font-medium">{data?.webapps.down ?? 0}</span> down
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-600">Failures</div>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              recentFailures.length === 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${recentFailures.length === 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {recentFailures.length}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Recent failures</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Uptime Chart */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <div className="font-medium">Uptime History</div>
              <div className="text-xs text-slate-500">Endpoint availability over time</div>
            </div>
            <div className="text-xs text-slate-500">{range}</div>
          </div>
          <div className="p-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis width={40} domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value: unknown, _name, props: any) => {
                      const pct = typeof value === "number" ? value : null;
                      const payload = props?.payload;
                      const total = payload?.totalCount ?? 0;
                      const ok = payload?.okCount ?? 0;
                      return [pct === null ? "—" : `${pct}% (${ok}/${total} checks)`, "Uptime"];
                    }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="okPct"
                    strokeWidth={2}
                    dot={false}
                    stroke="#10b981"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Server Fleet */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <div className="font-medium">Server Fleet</div>
              <div className="text-xs text-slate-500">Recent servers</div>
            </div>
            <Link
              to="/servers"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentServers.slice(0, 5).map((s) => {
              const isActive = s.lastSeenAt && (Date.now() - new Date(s.lastSeenAt).getTime() < 5 * 60 * 1000);
              return (
                <Link
                  key={s.id}
                  to={`/servers/${s.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <ServerIcon isActive={!!isActive} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{s.name}</span>
                      {isActive ? (
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="inline-flex h-2 w-2 rounded-full bg-slate-300" />
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{s.vendor ?? "No vendor"}</div>
                  </div>
                </Link>
              );
            })}
            {recentServers.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                No servers yet.{" "}
                <Link to="/servers/manage" className="text-slate-900 underline">
                  Add one
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Recent Failures */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="font-medium">Recent Failures</div>
            <div className="text-xs text-slate-500">Latest failed endpoint checks</div>
          </div>
          <div className="text-xs text-slate-500">{recentFailures.length} failures</div>
        </div>

        {recentFailures.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-slate-900">All systems operational</div>
              <div className="text-sm text-slate-500">No recent failures detected</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentFailures.slice(0, 10).map((f, idx) => (
              <div
                key={`${f.webAppId}-${idx}`}
                className="flex items-start gap-4 px-5 py-4"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{f.webAppName}</span>
                    <span className="text-xs text-slate-500">{formatDateTime(f.checkedAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>HTTP {f.httpStatus ?? "—"}</span>
                    <span>{formatMs(f.responseTimeMs ?? null)}</span>
                  </div>
                  {f.error && (
                    <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {f.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
