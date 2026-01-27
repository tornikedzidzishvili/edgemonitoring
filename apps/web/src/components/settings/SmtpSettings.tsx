import { useState, useEffect, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type SmtpSettingsInfo } from "../../lib/api";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const dangerBtnClasses =
  "rounded-lg border border-neon-rose/50 bg-neon-rose/10 px-4 py-2.5 text-sm font-medium text-neon-rose transition-all hover:bg-neon-rose/20";

export default function SmtpSettings() {
  const [settings, setSettings] = useState<SmtpSettingsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.smtpSettings();
      if (data.configured && data.settings) {
        setSettings(data.settings);
        setHost(data.settings.host);
        setPort(data.settings.port.toString());
        setSecure(data.settings.secure);
        setUsername(data.settings.username || "");
        setFromEmail(data.settings.fromEmail);
        setFromName(data.settings.fromName || "");
      } else {
        // Mailgun-friendly defaults
        setSettings(null);
        setHost("smtp.mailgun.org");
        setPort("587");
        setSecure(true);
        setUsername("");
        setPassword("");
        setFromEmail("");
        setFromName("");
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SMTP settings");
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
      const data = await api.saveSmtpSettings({
        host,
        port: parseInt(port, 10),
        secure,
        username: username || null,
        password: password || undefined,
        fromEmail,
        fromName: fromName || null
      });
      setSettings(data.settings);
      setPassword(""); // Clear password field after save
      setSuccess("SMTP settings saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SMTP settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete SMTP settings?")) return;

    setError("");
    setSuccess("");

    try {
      await api.deleteSmtpSettings();
      setSettings(null);
      // Mailgun-friendly defaults
      setHost("smtp.mailgun.org");
      setPort("587");
      setSecure(true);
      setUsername("");
      setPassword("");
      setFromEmail("");
      setFromName("");
      setSuccess("SMTP settings deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete SMTP settings");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading SMTP settings...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">SMTP Configuration</h2>
          <p className="mt-1 text-sm text-slate-400">Configure email delivery settings</p>
        </div>
        {settings && (
          <button type="button" onClick={handleDelete} className={dangerBtnClasses}>
            Delete Configuration
          </button>
        )}
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
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="host" className={labelClasses}>
              SMTP Host
            </label>
            <input
              id="host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              placeholder="smtp.mailgun.org"
              className={inputClasses}
            />
            <p className="mt-2 text-xs text-slate-500">
              Mailgun default: <span className="font-medium text-slate-400">smtp.mailgun.org</span>
            </p>
          </div>

          <div>
            <label htmlFor="port" className={labelClasses}>
              Port
            </label>
            <input
              id="port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              required
              min={1}
              max={65535}
              className={inputClasses}
            />
            <p className="mt-2 text-xs text-slate-500">
              Mailgun typically uses <span className="font-medium text-slate-400">587 (TLS)</span> or{" "}
              <span className="font-medium text-slate-400">465 (SSL)</span>.
            </p>
          </div>

          <div>
            <label htmlFor="username" className={labelClasses}>
              Username <span className="text-slate-500">(Mailgun: postmaster@YOUR_DOMAIN)</span>
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="postmaster@mg.example.com"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="password" className={labelClasses}>
              Password{" "}
              {settings?.hasPassword && <span className="text-slate-500">(leave blank to keep current)</span>}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings?.hasPassword ? "Leave blank to keep current" : "Mailgun SMTP password"}
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="fromEmail" className={labelClasses}>
              From Email
            </label>
            <input
              id="fromEmail"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              placeholder="alerts@mg.example.com"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="fromName" className={labelClasses}>
              From Name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="fromName"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Edge Monitoring"
              className={inputClasses}
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <input
            id="secure"
            type="checkbox"
            checked={secure}
            onChange={(e) => setSecure(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50 focus:ring-offset-obsidian-900"
          />
          <label htmlFor="secure" className="text-sm text-slate-300">
            Use TLS (recommended)
          </label>
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
