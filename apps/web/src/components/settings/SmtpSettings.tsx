import { useState, useEffect, type FormEvent } from "react";
import { api, type SmtpSettingsInfo } from "../../lib/api";

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
      setHost("");
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
    return <div className="text-sm text-slate-500">Loading SMTP settings...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SMTP Configuration</h2>
          <p className="mt-1 text-sm text-slate-500">Configure email delivery settings</p>
        </div>
        {settings && (
          <button
            onClick={handleDelete}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete Configuration
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="host" className="block text-sm font-medium text-slate-700">
              SMTP Host
            </label>
            <input
              id="host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              placeholder="smtp.example.com"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label htmlFor="port" className="block text-sm font-medium text-slate-700">
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
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Username <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password{" "}
              {settings?.hasPassword && (
                <span className="text-slate-400">(leave blank to keep current)</span>
              )}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings?.hasPassword ? "Leave blank to keep current" : ""}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label htmlFor="fromEmail" className="block text-sm font-medium text-slate-700">
              From Email
            </label>
            <input
              id="fromEmail"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              placeholder="noreply@example.com"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label htmlFor="fromName" className="block text-sm font-medium text-slate-700">
              From Name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="fromName"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Edge Monitoring"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="secure"
            type="checkbox"
            checked={secure}
            onChange={(e) => setSecure(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          <label htmlFor="secure" className="text-sm text-slate-700">
            Use TLS/SSL (recommended)
          </label>
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
