import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type SharedHostingDetail, type SslStatus } from "../lib/api";
import { formatDateTime } from "../lib/format";

function SslBadge({ status, expiresAt }: { status: SslStatus; expiresAt: string | null }) {
  const getDaysUntilExpiry = () => {
    if (!expiresAt) return null;
    const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const days = getDaysUntilExpiry();

  const config = {
    valid: { bg: "bg-emerald-100", text: "text-emerald-700", label: "SSL Valid" },
    warning: { bg: "bg-amber-100", text: "text-amber-700", label: "Expiring Soon" },
    critical: { bg: "bg-red-100", text: "text-red-700", label: days !== null && days < 0 ? "Expired" : "Expiring" },
    unknown: { bg: "bg-slate-100", text: "text-slate-600", label: "Unknown" }
  };

  const { bg, text, label } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text}`}>
      {status === "valid" && (
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )}
      {status === "warning" && (
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )}
      {status === "critical" && (
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
      {label}
      {days !== null && <span className="opacity-75">({days}d)</span>}
    </span>
  );
}

function HttpBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Pending
      </span>
    );
  }

  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Up
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Down
    </span>
  );
}

export default function SharedHostingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<SharedHostingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [addingDomain, setAddingDomain] = useState(false);
  const [domainInput, setDomainInput] = useState("");

  async function refresh() {
    if (!id) return;
    try {
      const data = await api.sharedHostingDetail(id);
      setAccount(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [id]);

  async function onAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !domainInput.trim()) return;
    setError(null);
    setAddingDomain(true);
    try {
      await api.adminAddDomain(id, { domain: domainInput.trim() });
      setDomainInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  }

  async function onToggleEnabled(domainId: string, currentEnabled: boolean) {
    if (!id) return;
    setError(null);
    try {
      await api.adminUpdateDomain(id, domainId, { enabled: !currentEnabled });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update domain");
    }
  }

  async function onDeleteDomain(domainId: string) {
    if (!id) return;
    if (!confirm("Delete this domain?")) return;
    setError(null);
    try {
      await api.adminDeleteDomain(id, domainId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete domain");
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-slate-500">Loading...</div>;
  }

  if (!account) {
    return (
      <div className="py-8 text-center">
        <p className="text-slate-500">Account not found</p>
        <Link to="/shared-hosting" className="mt-2 text-sm text-slate-600 hover:text-slate-900">
          &larr; Back to Shared Hosting
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/shared-hosting" className="text-sm text-slate-500 hover:text-slate-700">
            &larr; Shared Hosting
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{account.name}</h1>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Add Domain Form */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-900">Add Domain</h2>
        <form onSubmit={onAddDomain} className="flex gap-3">
          <input
            type="text"
            placeholder="example.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            disabled={addingDomain || !domainInput.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {addingDomain ? "Adding..." : "Add Domain"}
          </button>
        </form>
      </div>

      {/* Domains Table */}
      {account.domains.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-8 text-center text-slate-500">
          No domains yet. Add one above to start monitoring.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Domain
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  HTTP
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  SSL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  IP Address
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Response
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {account.domains.map((domain) => (
                <tr key={domain.id} className={!domain.enabled ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${domain.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-slate-900 hover:text-slate-700"
                      >
                        {domain.domain}
                      </a>
                      {!domain.enabled && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                          Disabled
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <HttpBadge ok={domain.lastCheck?.httpOk ?? null} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <SslBadge status={domain.sslStatus} expiresAt={domain.sslExpiresAt} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <span className="font-mono">{domain.lastKnownIp || "-"}</span>
                      {domain.lastCheck?.ipChanged && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          Changed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {domain.lastCheck?.responseTimeMs != null
                      ? `${domain.lastCheck.responseTimeMs}ms`
                      : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onToggleEnabled(domain.id, domain.enabled)}
                        className="text-slate-400 hover:text-slate-600"
                        title={domain.enabled ? "Disable monitoring" : "Enable monitoring"}
                      >
                        {domain.enabled ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteDomain(domain.id)}
                        className="text-slate-400 hover:text-red-600"
                        title="Delete domain"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="text-xs text-slate-500">
        <p className="font-medium">SSL Status Legend:</p>
        <ul className="mt-1 flex flex-wrap gap-4">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Valid (30+ days)
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Warning (7-30 days)
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Critical (&lt;7 days or expired)
          </li>
        </ul>
      </div>
    </div>
  );
}
