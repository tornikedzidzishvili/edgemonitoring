import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type SharedHostingDetail, type SslStatus } from "../lib/api";
import { formatDateTime } from "../lib/format";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

function SslBadge({ status, expiresAt }: { status: SslStatus; expiresAt: string | null }) {
  const getDaysUntilExpiry = () => {
    if (!expiresAt) return null;
    const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const days = getDaysUntilExpiry();

  const config = {
    valid: {
      border: "border-neon-emerald/30",
      bg: "bg-neon-emerald/10",
      text: "text-neon-emerald",
      label: "SSL Valid"
    },
    warning: {
      border: "border-neon-amber/30",
      bg: "bg-neon-amber/10",
      text: "text-neon-amber",
      label: "Expiring Soon"
    },
    critical: {
      border: "border-neon-rose/30",
      bg: "bg-neon-rose/10",
      text: "text-neon-rose",
      label: days !== null && days < 0 ? "Expired" : "Expiring"
    },
    unknown: {
      border: "border-slate-600/30",
      bg: "bg-slate-600/10",
      text: "text-slate-400",
      label: "Unknown"
    }
  };

  const { border, bg, text, label } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${border} ${bg} ${text}`}>
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/30 bg-slate-600/10 px-2.5 py-1 text-xs font-medium text-slate-400">
        Pending
      </span>
    );
  }

  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-emerald/30 bg-neon-emerald/10 px-2.5 py-1 text-xs font-medium text-neon-emerald">
      <span className="h-1.5 w-1.5 rounded-full bg-neon-emerald shadow-sm shadow-neon-emerald/50" />
      Up
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-rose/30 bg-neon-rose/10 px-2.5 py-1 text-xs font-medium text-neon-rose">
      <span className="h-1.5 w-1.5 rounded-full bg-neon-rose shadow-sm shadow-neon-rose/50" />
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
    return (
      <div className="py-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        <p className="mt-3 text-sm text-slate-400">Loading account...</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/30">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-400">Account not found</p>
        <Link
          to="/shared-hosting"
          className="mt-4 inline-flex items-center gap-2 text-sm text-neon-cyan hover:text-neon-cyan/80 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to Shared Hosting
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/shared-hosting"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-neon-cyan transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Shared Hosting
          </Link>
          <h1 className="mt-2 text-2xl font-display font-bold text-white">{account.name}</h1>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-neon-violet/20 to-neon-cyan/10 text-neon-violet">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
        >
          {error}
        </motion.div>
      )}

      {/* Add Domain Form */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h2 className="font-medium text-white">Add Domain</h2>
        </div>
        <form onSubmit={onAddDomain} className="flex gap-3">
          <input
            type="text"
            placeholder="example.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            className={inputClasses + " flex-1"}
          />
          <button type="submit" disabled={addingDomain || !domainInput.trim()} className={primaryBtnClasses}>
            {addingDomain ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Adding...
              </span>
            ) : (
              "Add Domain"
            )}
          </button>
        </form>
      </div>

      {/* Domains Table */}
      {account.domains.length === 0 ? (
        <div className="rounded-xl border border-slate-700/30 bg-obsidian-800/30 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div className="mt-4 text-sm font-medium text-slate-400">No domains yet</div>
          <div className="mt-1 text-xs text-slate-500">Add one above to start monitoring</div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 shadow-xl backdrop-blur-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="bg-obsidian-800/60">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Domain
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    HTTP
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    SSL
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    IP Address
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Response
                  </th>
                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {account.domains.map((domain, idx) => (
                  <motion.tr
                    key={domain.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`transition-colors hover:bg-obsidian-700/30 ${!domain.enabled ? "opacity-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://${domain.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-white hover:text-neon-cyan transition-colors"
                        >
                          {domain.domain}
                        </a>
                        {!domain.enabled && (
                          <span className="rounded-full border border-slate-600/30 bg-slate-600/10 px-2 py-0.5 text-xs text-slate-400">
                            Disabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <HttpBadge ok={domain.lastCheck?.httpOk ?? null} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <SslBadge status={domain.sslStatus} expiresAt={domain.sslExpiresAt} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-slate-300">{domain.lastKnownIp || "—"}</span>
                        {domain.lastCheck?.ipChanged && (
                          <span className="rounded-full border border-neon-amber/30 bg-neon-amber/10 px-2 py-0.5 text-xs font-medium text-neon-amber">
                            Changed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-sm text-slate-400">
                      {domain.lastCheck?.responseTimeMs != null
                        ? `${domain.lastCheck.responseTimeMs}ms`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleEnabled(domain.id, domain.enabled)}
                          className="rounded-lg p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-white"
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
                          type="button"
                          onClick={() => onDeleteDomain(domain.id)}
                          className="rounded-lg p-2 text-slate-400 transition-all hover:bg-neon-rose/10 hover:text-neon-rose"
                          title="Delete domain"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 shadow-xl backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">SSL Status Legend</p>
        <div className="flex flex-wrap gap-6 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-neon-emerald shadow-sm shadow-neon-emerald/50" />
            <span>Valid (30+ days)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-neon-amber shadow-sm shadow-neon-amber/50" />
            <span>Warning (7-30 days)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-neon-rose shadow-sm shadow-neon-rose/50" />
            <span>Critical (&lt;7 days or expired)</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
