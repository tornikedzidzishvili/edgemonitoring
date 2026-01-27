import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type ServerAlertSettingsInfo } from "../../lib/api";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

export default function ServerAlertSettings() {
  const [settings, setSettings] = useState<ServerAlertSettingsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [cpuThresholdPct, setCpuThresholdPct] = useState(90);
  const [cpuDurationMin, setCpuDurationMin] = useState(5);
  const [ramThresholdPct, setRamThresholdPct] = useState(90);
  const [ramDurationMin, setRamDurationMin] = useState(5);
  const [offlineTimeoutMin, setOfflineTimeoutMin] = useState(3);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.serverAlertSettings();
      setSettings(data.settings);
      setCpuThresholdPct(data.settings.cpuThresholdPct);
      setCpuDurationMin(data.settings.cpuDurationMin);
      setRamThresholdPct(data.settings.ramThresholdPct);
      setRamDurationMin(data.settings.ramDurationMin);
      setOfflineTimeoutMin(data.settings.offlineTimeoutMin);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const data = await api.saveServerAlertSettings({
        cpuThresholdPct,
        cpuDurationMin,
        ramThresholdPct,
        ramDurationMin,
        offlineTimeoutMin
      });
      setSettings(data.settings);
      setSuccess("Server alert settings saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading server alert settings...
      </div>
    );
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-white">Server Alert Thresholds</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure global thresholds for server alerting. These apply to all servers with alerting enabled unless overridden.
        </p>
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

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-4 py-3 text-sm text-neon-emerald"
        >
          {success}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-amber/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">CPU Alert</h3>
              <p className="text-xs text-slate-500">Trigger alert when CPU usage exceeds threshold for the specified duration</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cpuThreshold" className={labelClasses}>
                CPU Threshold (%)
              </label>
              <input
                id="cpuThreshold"
                type="number"
                min={1}
                max={100}
                value={cpuThresholdPct}
                onChange={(e) => setCpuThresholdPct(Number(e.target.value))}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="cpuDuration" className={labelClasses}>
                Duration (minutes)
              </label>
              <input
                id="cpuDuration"
                type="number"
                min={1}
                max={60}
                value={cpuDurationMin}
                onChange={(e) => setCpuDurationMin(Number(e.target.value))}
                className={inputClasses}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-violet/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neon-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 19v-3" />
                <path d="M10 19v-6" />
                <path d="M14 19v-9" />
                <path d="M18 19v-5" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">RAM Alert</h3>
              <p className="text-xs text-slate-500">Trigger alert when RAM usage exceeds threshold for the specified duration</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ramThreshold" className={labelClasses}>
                RAM Threshold (%)
              </label>
              <input
                id="ramThreshold"
                type="number"
                min={1}
                max={100}
                value={ramThresholdPct}
                onChange={(e) => setRamThresholdPct(Number(e.target.value))}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="ramDuration" className={labelClasses}>
                Duration (minutes)
              </label>
              <input
                id="ramDuration"
                type="number"
                min={1}
                max={60}
                value={ramDurationMin}
                onChange={(e) => setRamDurationMin(Number(e.target.value))}
                className={inputClasses}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-rose/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neon-rose" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Offline Detection</h3>
              <p className="text-xs text-slate-500">Trigger alert when server hasn't reported for the specified time</p>
            </div>
          </div>
          <div className="max-w-xs">
            <label htmlFor="offlineTimeout" className={labelClasses}>
              Offline Timeout (minutes)
            </label>
            <input
              id="offlineTimeout"
              type="number"
              min={1}
              max={60}
              value={offlineTimeoutMin}
              onChange={(e) => setOfflineTimeoutMin(Number(e.target.value))}
              className={inputClasses}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-neon-amber/30 bg-neon-amber/10 p-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-amber shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-neon-amber">
            Alerts repeat every 30 minutes until resolved. Enable alerting per-server in the Servers page.
          </p>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryBtnClasses}>
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </form>

      {settings && (
        <p className="mt-6 text-xs text-slate-500">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
