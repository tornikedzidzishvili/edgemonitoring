import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type AlertTemplatesInfo } from "../../lib/api";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const textareaClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20 font-mono";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

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
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading templates...
      </div>
    );
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-white">Templates</h2>
        <p className="mt-1 text-sm text-slate-400">Edit the email and SMS text used for downtime alerts</p>
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
        <div>
          <label htmlFor="emailSubject" className={labelClasses}>
            Email Subject
          </label>
          <input
            id="emailSubject"
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="emailBody" className={labelClasses}>
            Email Body
          </label>
          <textarea
            id="emailBody"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={8}
            className={textareaClasses}
          />
        </div>

        <div>
          <label htmlFor="smsBody" className={labelClasses}>
            SMS Text
          </label>
          <textarea
            id="smsBody"
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            rows={4}
            className={textareaClasses}
          />
          <div className="mt-3 rounded-lg border border-slate-700/50 bg-obsidian-800/40 p-3">
            <p className="text-xs text-slate-400">
              Supported placeholders:{" "}
              <code className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-neon-cyan">{"{{name}}"}</code>,{" "}
              <code className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-neon-cyan">{"{{url}}"}</code>,{" "}
              <code className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-neon-cyan">{"{{time}}"}</code>{" "}
              <span className="text-slate-500">(YYYY-MM-DD HH:MM UTC)</span>,{" "}
              <code className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-neon-cyan">{"{{httpStatus}}"}</code>,{" "}
              <code className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-neon-cyan">{"{{error}}"}</code>
            </p>
          </div>
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
              "Save Templates"
            )}
          </button>
        </div>
      </form>

      {templates && (
        <p className="mt-6 text-xs text-slate-500">
          Last updated: {new Date(templates.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
