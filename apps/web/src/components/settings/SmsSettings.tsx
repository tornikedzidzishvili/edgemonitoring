import { useEffect, useState, type FormEvent } from "react";
import { api, type SmsSettingsInfo } from "../../lib/api";

export default function SmsSettings() {
  const [settings, setSettings] = useState<SmsSettingsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [senderName, setSenderName] = useState("smsoffice");
  const [apiKey, setApiKey] = useState("");

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.smsSettings();
      if (data.settings) {
        setSettings(data.settings);
        setEnabled(data.settings.enabled);
        setSenderName(data.settings.senderName || "smsoffice");
      } else {
        setSettings(null);
        setEnabled(false);
        setSenderName("smsoffice");
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SMS settings");
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
      const data = await api.saveSmsSettings({
        enabled,
        senderName: senderName ? senderName : null,
        apiKey: apiKey ? apiKey : undefined
      });
      setSettings(data.settings);
      setApiKey("");
      setSuccess("SMS settings saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SMS settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading SMS settings...</div>;
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">SMS Configuration</h2>
        <p className="mt-1 text-sm text-slate-500">Configure SMS Office API key and enable SMS features</p>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="flex items-center space-x-2">
          <input
            id="smsEnabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          <label htmlFor="smsEnabled" className="text-sm text-slate-700">
            Enable SMS
          </label>
        </div>

        <div>
          <label htmlFor="smsSender" className="block text-sm font-medium text-slate-700">
            Sender Name
          </label>
          <input
            id="smsSender"
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="smsoffice"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <p className="mt-2 text-xs text-slate-500">
            Sent to SMS Office as <span className="font-medium">sender=</span> in the POST form.
          </p>
        </div>

        <div>
          <label htmlFor="smsApiKey" className="block text-sm font-medium text-slate-700">
            SMS Office API Key{" "}
            {settings?.hasApiKey && <span className="text-slate-400">(leave blank to keep current)</span>}
          </label>
          <input
            id="smsApiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? "Leave blank to keep current" : "Enter API key"}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <p className="mt-2 text-xs text-slate-500">
            Uses HTTPS POST to <span className="font-medium">smsoffice.ge</span> with Content-Type application/x-www-form-urlencoded.
          </p>
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
    </div>
  );
}
