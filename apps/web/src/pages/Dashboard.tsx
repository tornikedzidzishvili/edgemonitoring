import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { api, type DashboardRange, type DashboardResponse, type AlertCountResponse } from "../lib/api";
import { formatDateTime, formatFailureError, formatMs } from "../lib/format";

function formatCompactTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Animated counter component
function AnimatedNumber({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value ?? 0);

  useEffect(() => {
    if (value === null) return;
    const start = displayValue;
    const end = value;
    const duration = 800;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className="tabular-nums">
      {value === null ? "-" : displayValue}
      {suffix}
    </span>
  );
}

// Hexagonal status indicator
function HexStatus({ status, size = "md" }: { status: "healthy" | "warning" | "critical" | "inactive"; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-6 h-6"
  };

  const colorClasses = {
    healthy: "text-neon-emerald",
    warning: "text-neon-amber",
    critical: "text-neon-rose",
    inactive: "text-slate-500"
  };

  return (
    <div className={`${sizeClasses[size]} ${colorClasses[status]} relative`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
      </svg>
      {status !== "inactive" && (
        <div className={`absolute inset-0 ${colorClasses[status]} status-pulse`}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full opacity-40">
            <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
          </svg>
        </div>
      )}
    </div>
  );
}

// Server card with activity visualization
function ServerCard({ server, index }: { server: { id: number; name: string; vendor: string | null; lastSeenAt: string | null }; index: number }) {
  const isActive = server.lastSeenAt && (Date.now() - new Date(server.lastSeenAt).getTime() < 5 * 60 * 1000);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <Link
        to={`/servers/${server.id}`}
        className="group flex items-center gap-4 rounded-xl bg-obsidian-800/50 p-4 border border-slate-700/50 transition-all duration-300 hover:border-neon-cyan/30 hover:bg-obsidian-800"
      >
        <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 ${
          isActive
            ? "bg-neon-emerald/10 text-neon-emerald group-hover:bg-neon-emerald/20"
            : "bg-slate-800 text-slate-500"
        }`}>
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="6" rx="1" />
            <rect x="2" y="13" width="20" height="6" rx="1" />
            <circle cx="6" cy="6" r="1" fill="currentColor" />
            <circle cx="6" cy="16" r="1" fill="currentColor" />
          </svg>
          {isActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-neon-emerald status-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-100 truncate group-hover:text-white transition-colors">
              {server.name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500 font-mono">{server.vendor ?? "Unknown"}</span>
            {isActive && (
              <span className="text-[10px] uppercase tracking-wider text-neon-emerald/80 font-medium">Online</span>
            )}
          </div>
        </div>
        <svg className="h-5 w-5 text-slate-600 group-hover:text-neon-cyan transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </motion.div>
  );
}

// Stats card component
function StatCard({
  title,
  value,
  suffix = "",
  subtitle,
  icon,
  variant = "default",
  delay = 0
}: {
  title: string;
  value: number | null;
  suffix?: string;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  delay?: number;
}) {
  const variantStyles = {
    default: {
      bg: "bg-obsidian-800/60",
      border: "border-slate-700/50 hover:border-slate-600/50",
      iconBg: "bg-slate-700/50",
      iconColor: "text-slate-400",
      valueColor: "text-slate-100"
    },
    success: {
      bg: "bg-neon-emerald/5",
      border: "border-neon-emerald/20 hover:border-neon-emerald/40",
      iconBg: "bg-neon-emerald/10",
      iconColor: "text-neon-emerald",
      valueColor: "text-neon-emerald"
    },
    warning: {
      bg: "bg-neon-amber/5",
      border: "border-neon-amber/20 hover:border-neon-amber/40",
      iconBg: "bg-neon-amber/10",
      iconColor: "text-neon-amber",
      valueColor: "text-neon-amber"
    },
    danger: {
      bg: "bg-neon-rose/5",
      border: "border-neon-rose/20 hover:border-neon-rose/40",
      iconBg: "bg-neon-rose/10",
      iconColor: "text-neon-rose",
      valueColor: "text-neon-rose"
    }
  };

  const styles = variantStyles[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={`relative overflow-hidden rounded-2xl ${styles.bg} border ${styles.border} p-5 transition-all duration-300`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className={`font-display text-4xl font-bold ${styles.valueColor}`}>
              <AnimatedNumber value={value} suffix={suffix} />
            </span>
          </div>
          {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${styles.iconBg} ${styles.iconColor}`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// Custom tooltip for chart
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { totalCount: number; okCount: number } }>; label?: string }) {
  if (!active || !payload?.length) return null;

  const data = payload[0];
  const pct = data.value;
  const total = data.payload.totalCount;
  const ok = data.payload.okCount;

  return (
    <div className="glass-card rounded-lg px-4 py-3 shadow-xl border border-slate-700/50">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-neon-emerald">{pct?.toFixed(1) ?? "-"}%</p>
      <p className="text-xs text-slate-500 mt-1">{ok}/{total} checks passed</p>
    </div>
  );
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
  }
};

export default function Dashboard() {
  const [range, setRange] = useState<DashboardRange>("24h");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [alertCount, setAlertCount] = useState<AlertCountResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);

  async function refresh(nextRange: DashboardRange = range) {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const [res, alerts] = await Promise.all([
        api.dashboard(nextRange),
        api.alertCount()
      ]);
      setData(res);
      setAlertCount(alerts);
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

  const healthPct = useMemo(() => {
    if (!data) return null;
    const total = data.webapps.up + data.webapps.down;
    if (total === 0) return null;
    return Math.round((data.webapps.up / total) * 100);
  }, [data]);

  const hasFailures = recentFailures.length > 0;
  const hasAlerts = (alertCount?.activeCount ?? 0) > 0;

  // Determine overall system status
  const systemStatus = useMemo(() => {
    if (hasFailures || (healthPct !== null && healthPct < 80)) return "critical";
    if (hasAlerts || (healthPct !== null && healthPct < 95)) return "warning";
    if (healthPct === null) return "inactive";
    return "healthy";
  }, [hasFailures, hasAlerts, healthPct]);

  const rangeOptions = [
    { value: "24h", label: "24H" },
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" }
  ];

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header */}
      <motion.div
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        variants={itemVariants}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <HexStatus status={systemStatus} size="lg" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
              Command Center
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {systemStatus === "healthy" && "All systems operational"}
              {systemStatus === "warning" && "Some systems require attention"}
              {systemStatus === "critical" && "Critical issues detected"}
              {systemStatus === "inactive" && "Waiting for data..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:block font-mono">
            {formatDateTime(data?.generatedAt)}
          </span>

          {/* Range selector */}
          <div className="flex rounded-lg bg-obsidian-800 p-1 border border-slate-700/50">
            {rangeOptions.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setRange(opt.value as DashboardRange)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  range === opt.value
                    ? "bg-neon-cyan text-obsidian-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            onClick={() => refresh(range)}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 px-4 py-2 text-sm font-medium text-neon-cyan transition-all hover:bg-neon-cyan/20 disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
          >
            <svg
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="rounded-xl bg-neon-rose/10 border border-neon-rose/30 px-4 py-3 text-sm text-neon-rose"
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          title="Servers"
          value={data?.servers.total ?? null}
          subtitle={
            <span>
              <span className="text-neon-emerald font-medium">{data?.servers.active ?? 0}</span> active
            </span>
          }
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="6" rx="1" />
              <rect x="2" y="13" width="20" height="6" rx="1" />
              <circle cx="6" cy="6" r="1" fill="currentColor" />
              <circle cx="6" cy="16" r="1" fill="currentColor" />
            </svg>
          }
          delay={0}
        />

        <StatCard
          title="Endpoints"
          value={data?.webapps.total ?? null}
          subtitle="HTTP endpoints"
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          }
          delay={0.05}
        />

        <StatCard
          title="Health"
          value={healthPct}
          suffix="%"
          subtitle={
            <span>
              <span className="text-neon-emerald">{data?.webapps.up ?? 0}</span> up, <span className="text-neon-rose">{data?.webapps.down ?? 0}</span> down
            </span>
          }
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          }
          variant={
            healthPct === null ? "default" :
            healthPct >= 95 ? "success" :
            healthPct >= 80 ? "warning" : "danger"
          }
          delay={0.1}
        />

        <StatCard
          title="Failures"
          value={recentFailures.length}
          subtitle="Recent failures"
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
            </svg>
          }
          variant={hasFailures ? "danger" : "default"}
          delay={0.15}
        />

        <Link to="/alerts" className="block col-span-2 lg:col-span-1">
          <StatCard
            title="Alerts"
            value={alertCount?.activeCount ?? null}
            subtitle={
              hasAlerts ? (
                <span className="text-xs">
                  <span className="text-orange-400">{alertCount?.byType.cpu ?? 0}</span> CPU, {" "}
                  <span className="text-purple-400">{alertCount?.byType.ram ?? 0}</span> RAM, {" "}
                  <span className="text-slate-400">{alertCount?.byType.offline ?? 0}</span> Off
                </span>
              ) : (
                "No active alerts"
              )
            }
            icon={
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
              </svg>
            }
            variant={hasAlerts ? "warning" : "default"}
            delay={0.2}
          />
        </Link>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Uptime Chart */}
        <motion.div
          className="lg:col-span-2 rounded-2xl bg-obsidian-800/40 border border-slate-700/50 overflow-hidden"
          variants={itemVariants}
        >
          <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
            <div>
              <h2 className="font-display font-semibold text-white">Uptime Telemetry</h2>
              <p className="text-xs text-slate-500 mt-0.5">Endpoint availability over time</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-neon-emerald" />
              <span className="text-xs text-slate-400">Uptime %</span>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="h-56 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="uptimeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    width={45}
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="okPct"
                    stroke="#34d399"
                    strokeWidth={2}
                    fill="url(#uptimeGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#34d399", stroke: "#0a0f1a", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Server Fleet */}
        <motion.div
          className="rounded-2xl bg-obsidian-800/40 border border-slate-700/50 overflow-hidden"
          variants={itemVariants}
        >
          <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
            <div>
              <h2 className="font-display font-semibold text-white">Server Fleet</h2>
              <p className="text-xs text-slate-500 mt-0.5">Recent activity</p>
            </div>
            <Link
              to="/servers"
              className="text-xs font-medium text-neon-cyan hover:text-neon-cyan/80 transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto scrollbar-hide">
            {recentServers.slice(0, 5).map((s, index) => (
              <ServerCard key={s.id} server={s} index={index} />
            ))}
            {recentServers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center mb-3">
                  <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="20" height="6" rx="1" />
                    <rect x="2" y="13" width="20" height="6" rx="1" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500">No servers yet</p>
                <Link
                  to="/servers/manage"
                  className="mt-2 text-xs text-neon-cyan hover:underline"
                >
                  Add your first server
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Recent Failures */}
      <motion.div
        className="rounded-2xl bg-obsidian-800/40 border border-slate-700/50 overflow-hidden"
        variants={itemVariants}
      >
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center gap-3">
            {hasFailures && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-rose opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-rose" />
              </span>
            )}
            <div>
              <h2 className="font-display font-semibold text-white">Recent Failures</h2>
              <p className="text-xs text-slate-500 mt-0.5">Latest failed endpoint checks</p>
            </div>
          </div>
          <Link
            to="/failures"
            className="text-xs font-medium text-neon-cyan hover:text-neon-cyan/80 transition-colors"
          >
            View all
          </Link>
        </div>

        {recentFailures.length === 0 ? (
          <motion.div
            className="flex items-center gap-4 px-6 py-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-emerald/10 text-neon-emerald">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-white">All systems operational</p>
              <p className="text-sm text-slate-500 mt-0.5">No recent failures detected</p>
            </div>
          </motion.div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {recentFailures.slice(0, 5).map((f, idx) => (
              <motion.div
                key={`${f.webAppId}-${idx}`}
                className="flex items-start gap-4 px-6 py-4 hover:bg-obsidian-800/50 transition-colors"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon-rose/10 text-neon-rose">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="font-medium text-white truncate">{f.webAppName}</span>
                    <span className="text-xs text-slate-500 font-mono">{formatDateTime(f.checkedAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-md font-mono ${
                      (f.httpStatus ?? 0) >= 500
                        ? "bg-neon-rose/10 text-neon-rose"
                        : "bg-neon-amber/10 text-neon-amber"
                    }`}>
                      HTTP {f.httpStatus ?? "-"}
                    </span>
                    <span className="text-slate-500">{formatMs(f.responseTimeMs ?? null)}</span>
                  </div>
                  {f.error && (
                    <div className="mt-2 rounded-lg bg-neon-rose/5 border border-neon-rose/20 px-3 py-2 text-xs text-slate-400 font-mono line-clamp-2">
                      {formatFailureError(f.error)}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
