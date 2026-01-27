import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type AlertRecipientInfo, type UserInfo } from "../../lib/api";

type Method = "none" | "email" | "sms" | "both";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const selectClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const secondaryBtnClasses =
  "rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed";

export default function AlertsSettings() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [recipients, setRecipients] = useState<AlertRecipientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<Method>("none");

  const recipientsByUserId = useMemo(() => {
    const map = new Map<string, AlertRecipientInfo>();
    for (const r of recipients) map.set(r.user.id, r);
    return map;
  }, [recipients]);

  const load = async () => {
    try {
      setLoading(true);
      const [u, r] = await Promise.all([api.users(), api.alertRecipients()]);
      setUsers(u.users);
      setRecipients(r.recipients);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alert settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadUserIntoForm = (id: string) => {
    setUserId(id);
    const existing = recipientsByUserId.get(id);
    if (existing) {
      setEmail(existing.email ?? "");
      setPhone(existing.phone ?? "");
      setMethod(existing.method as Method);
    } else {
      const u = users.find((x) => x.id === id);
      setEmail(u?.email ?? "");
      setPhone(u?.phone ?? "");
      setMethod("none");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!userId) {
      setError("Please select a user");
      return;
    }

    if ((method === "email" || method === "both") && !email) {
      setError("Email is required for Email/Both");
      return;
    }

    if ((method === "sms" || method === "both") && !phone) {
      setError("Phone is required for SMS/Both");
      return;
    }

    setSaving(true);
    try {
      await api.saveAlertRecipient({
        userId,
        method,
        email: email ? email : null,
        phone: phone ? phone : null
      });
      await load();
      setSuccess("Alert recipient saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alert recipient");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError("");
    setSuccess("");

    const hasEmail = !!email;
    const hasPhone = !!phone;
    if (!hasEmail && !hasPhone) {
      setError("Enter an email and/or phone to send a test");
      return;
    }

    setTesting(true);
    try {
      const res = await api.testAlerts({
        email: hasEmail ? email : null,
        phone: hasPhone ? phone : null
      });

      const e = res.result.email;
      const s = res.result.sms;

      const parts: string[] = [];
      if (e.attempted) parts.push(`Email: ${e.sent ? "sent" : e.error ? `failed (${e.error})` : "failed"}`);
      if (s.attempted) parts.push(`SMS: ${s.sent ? "sent" : s.error ? `failed (${s.error})` : "failed"}`);
      setSuccess(parts.length ? `Test notifications: ${parts.join(" | ")}` : "Test completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test notifications");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading alert settings...
      </div>
    );
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-white">Alerts</h2>
        <p className="mt-1 text-sm text-slate-400">Choose who gets alerted when a service goes down</p>
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
          <label htmlFor="alertUser" className={labelClasses}>
            User
          </label>
          <select
            id="alertUser"
            value={userId}
            onChange={(e) => loadUserIntoForm(e.target.value)}
            className={selectClasses}
          >
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.email})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="alertEmail" className={labelClasses}>
              Alert Email
            </label>
            <input
              id="alertEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="alertPhone" className={labelClasses}>
              Alert Phone
            </label>
            <input
              id="alertPhone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9955XXXXXXXX"
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label htmlFor="alertMethod" className={labelClasses}>
            Alert Method
          </label>
          <select
            id="alertMethod"
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className={selectClasses}
          >
            <option value="none">None</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={handleTest} disabled={testing} className={secondaryBtnClasses}>
            {testing ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending...
              </span>
            ) : (
              "Send Test"
            )}
          </button>
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
              "Save Recipient"
            )}
          </button>
        </div>
      </form>

      <div className="mt-10">
        <h3 className="text-sm font-semibold text-white">Configured Recipients</h3>
        <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden rounded-xl border border-slate-700/50">
              <table className="min-w-full divide-y divide-slate-700/50">
                <thead className="bg-obsidian-800/60">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">User</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Email</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Phone</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {recipients.map((r, idx) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="transition-colors hover:bg-obsidian-700/30"
                    >
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="font-medium text-white">{r.user.fullName}</div>
                        <div className="text-sm text-slate-400">{r.user.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400">{r.email || "—"}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400">{r.phone || "—"}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="inline-flex rounded-full border border-slate-600/30 bg-slate-600/10 px-2.5 py-1 text-xs font-medium text-slate-400">
                          {r.method}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                  {recipients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-500">
                        No alert recipients configured
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
