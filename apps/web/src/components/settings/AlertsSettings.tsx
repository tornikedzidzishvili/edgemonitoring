import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type AlertRecipientInfo, type UserInfo } from "../../lib/api";

type Method = "none" | "email" | "sms" | "both";

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
    return <div className="text-sm text-slate-500">Loading alert settings...</div>;
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Alerts</h2>
        <p className="mt-1 text-sm text-slate-500">Choose who gets alerted when a service goes down</p>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div>
          <label htmlFor="alertUser" className="block text-sm font-medium text-slate-700">
            User
          </label>
          <select
            id="alertUser"
            value={userId}
            onChange={(e) => loadUserIntoForm(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 py-2 pl-3 pr-10 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
            <label htmlFor="alertEmail" className="block text-sm font-medium text-slate-700">
              Alert Email
            </label>
            <input
              id="alertEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label htmlFor="alertPhone" className="block text-sm font-medium text-slate-700">
              Alert Phone
            </label>
            <input
              id="alertPhone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9955XXXXXXXX"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="alertMethod" className="block text-sm font-medium text-slate-700">
            Alert Method
          </label>
          <select
            id="alertMethod"
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className="mt-1 block w-full rounded-md border border-slate-300 py-2 pl-3 pr-10 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="none">None</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? "Sending..." : "Send Test"}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Recipient"}
          </button>
        </div>
      </form>

      <div className="mt-10">
        <h3 className="text-sm font-semibold text-slate-900">Configured Recipients</h3>
        <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-medium text-slate-900">{r.user.fullName}</div>
                        <div className="text-sm text-slate-500">{r.user.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{r.email || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{r.phone || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{r.method}</td>
                    </tr>
                  ))}
                  {recipients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
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
