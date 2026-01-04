import { useEffect, useState, type FormEvent } from "react";
import { api, type ServerAlertSettingsInfo } from "../../lib/api";

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
    return <div className="text-sm text-slate-500">Loading server alert settings...</div>;
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Server Alert Thresholds</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure global thresholds for server alerting. These apply to all servers with alerting enabled unless overridden.
        </p>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-900">CPU Alert</h3>
          <p className="mt-1 text-xs text-slate-500">Trigger alert when CPU usage exceeds threshold for the specified duration</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cpuThreshold" className="block text-sm font-medium text-slate-700">
                CPU Threshold (%)
              </label>
              <input
                id="cpuThreshold"
                type="number"
                min={1}
                max={100}
                value={cpuThresholdPct}
                onChange={(e) => setCpuThresholdPct(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
            <div>
              <label htmlFor="cpuDuration" className="block text-sm font-medium text-slate-700">
                Duration (minutes)
              </label>
              <input
                id="cpuDuration"
                type="number"
                min={1}
                max={60}
                value={cpuDurationMin}
                onChange={(e) => setCpuDurationMin(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-900">RAM Alert</h3>
          <p className="mt-1 text-xs text-slate-500">Trigger alert when RAM usage exceeds threshold for the specified duration</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ramThreshold" className="block text-sm font-medium text-slate-700">
                RAM Threshold (%)
              </label>
              <input
                id="ramThreshold"
                type="number"
                min={1}
                max={100}
                value={ramThresholdPct}
                onChange={(e) => setRamThresholdPct(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
            <div>
              <label htmlFor="ramDuration" className="block text-sm font-medium text-slate-700">
                Duration (minutes)
              </label>
              <input
                id="ramDuration"
                type="number"
                min={1}
                max={60}
                value={ramDurationMin}
                onChange={(e) => setRamDurationMin(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-900">Offline Detection</h3>
          <p className="mt-1 text-xs text-slate-500">Trigger alert when server hasn't reported for the specified time</p>
          <div className="mt-3">
            <label htmlFor="offlineTimeout" className="block text-sm font-medium text-slate-700">
              Offline Timeout (minutes)
            </label>
            <input
              id="offlineTimeout"
              type="number"
              min={1}
              max={60}
              value={offlineTimeoutMin}
              onChange={(e) => setOfflineTimeoutMin(Number(e.target.value))}
              className="mt-1 block w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>

        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Alerts repeat every 30 minutes until resolved. Enable alerting per-server in the Servers page.
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>

      {settings && (
        <p className="mt-4 text-xs text-slate-400">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
