import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type SmsSettingsInfo } from "../../lib/api";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

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
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading SMS settings...
      </div>
    );
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-white">SMS Configuration</h2>
        <p className="mt-1 text-sm text-slate-400">Configure SMS Office API key and enable SMS features</p>
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
        <div className="flex items-center space-x-3">
          <input
            id="smsEnabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50 focus:ring-offset-obsidian-900"
          />
          <label htmlFor="smsEnabled" className="text-sm text-slate-300">
            Enable SMS
          </label>
        </div>

        <div>
          <label htmlFor="smsSender" className={labelClasses}>
            Sender Name
          </label>
          <input
            id="smsSender"
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="smsoffice"
            className={inputClasses}
          />
          <p className="mt-2 text-xs text-slate-500">
            Sent to SMS Office as <span className="font-medium text-slate-400">sender=</span> in the POST form.
          </p>
        </div>

        <div>
          <label htmlFor="smsApiKey" className={labelClasses}>
            SMS Office API Key{" "}
            {settings?.hasApiKey && <span className="text-slate-500">(leave blank to keep current)</span>}
          </label>
          <input
            id="smsApiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? "Leave blank to keep current" : "Enter API key"}
            className={inputClasses}
          />
          <p className="mt-2 text-xs text-slate-500">
            Uses HTTPS POST to <span className="font-medium text-slate-400">smsoffice.ge</span> with Content-Type
            application/x-www-form-urlencoded.
          </p>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryBtnClasses}>
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </span>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
