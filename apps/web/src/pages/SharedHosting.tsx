import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SharedHostingSummary } from "../lib/api";
import { formatDateTime } from "../lib/format";

export default function SharedHosting() {
  const [accounts, setAccounts] = useState<SharedHostingSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function refresh() {
    try {
      const data = await api.sharedHosting();
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shared hosting accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      await api.adminCreateSharedHosting({ name: name.trim() });
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this shared hosting account and all its domains?")) return;
    setError(null);
    try {
      await api.adminDeleteSharedHosting(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Shared Hosting</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor domains on shared hosting accounts. Track HTTP availability, DNS changes, and SSL certificate expiry.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Create Account Form */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-900">Add Shared Hosting Account</h2>
        <form onSubmit={onCreate} className="flex gap-3">
          <input
            type="text"
            placeholder="Account name (e.g., Hostinger, Bluehost)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Add Account"}
          </button>
        </form>
      </div>

      {/* Accounts List */}
      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : accounts.length === 0 ? (
        <div className="py-8 text-center text-slate-500">
          No shared hosting accounts yet. Create one above to start monitoring domains.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <Link
                  to={`/shared-hosting/${account.id}`}
                  className="text-base font-medium text-slate-900 hover:text-slate-700"
                >
                  {account.name}
                </Link>
                <button
                  onClick={() => onDelete(account.id)}
                  className="text-slate-400 hover:text-red-600"
                  title="Delete account"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span>{account.domainCount} domain{account.domainCount !== 1 ? "s" : ""}</span>
                </div>

                {account.issuesCount > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{account.issuesCount} issue{account.issuesCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-400">
                Created {formatDateTime(account.createdAt)}
              </div>

              <Link
                to={`/shared-hosting/${account.id}`}
                className="mt-3 block text-center text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                View Domains &rarr;
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
