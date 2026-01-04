import { useEffect, useState, type FormEvent } from "react";
import { api, type AlertTemplatesInfo } from "../../lib/api";

export default function TemplatesSettings() {
  const [templates, setTemplates] = useState<AlertTemplatesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsBody, setSmsBody] = useState("");

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await api.alertTemplates();
      setTemplates(data.templates);
      setEmailSubject(data.templates.emailSubject);
      setEmailBody(data.templates.emailBody);
      setSmsBody(data.templates.smsBody);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const data = await api.saveAlertTemplates({ emailSubject, emailBody, smsBody });
      setTemplates(data.templates);
      setSuccess("Templates saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save templates");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading templates...</div>;
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
        <p className="mt-1 text-sm text-slate-500">Edit the email and SMS text used for downtime alerts</p>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div>
          <label htmlFor="emailSubject" className="block text-sm font-medium text-slate-700">
            Email Subject
          </label>
          <input
            id="emailSubject"
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        <div>
          <label htmlFor="emailBody" className="block text-sm font-medium text-slate-700">
            Email Body
          </label>
          <textarea
            id="emailBody"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={8}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        <div>
          <label htmlFor="smsBody" className="block text-sm font-medium text-slate-700">
            SMS Text
          </label>
          <textarea
            id="smsBody"
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <p className="mt-2 text-xs text-slate-500">
            Supported placeholders: <span className="font-medium">{"{{name}}"}</span>,{" "}
            <span className="font-medium">{"{{url}}"}</span>,{" "}
            <span className="font-medium">{"{{time}}"}</span>,{" "}
            <span className="font-medium">{"{{httpStatus}}"}</span>,{" "}
            <span className="font-medium">{"{{error}}"}</span>
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Templates"}
          </button>
        </div>
      </form>

      {templates && (
        <div className="mt-6 text-xs text-slate-400">Last updated: {new Date(templates.updatedAt).toLocaleString()}</div>
      )}
    </div>
  );
}
