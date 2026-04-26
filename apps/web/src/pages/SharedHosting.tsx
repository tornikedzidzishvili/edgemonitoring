import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type SharedHostingSummary, type SharedHostingServerInfo } from "../lib/api";
import { formatDateTime } from "../lib/format";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const selectClasses =
  "rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

export default function SharedHosting() {
  const [accounts, setAccounts] = useState<SharedHostingSummary[]>([]);
  const [servers, setServers] = useState<SharedHostingServerInfo[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function loadServers() {
    try {
      const data = await api.sharedHostingServersPublic();
      setServers(data.servers);
    } catch (e) {
      // Servers may not be configured yet
    }
  }

  async function refresh() {
    try {
      const data = await api.sharedHosting(selectedServerId || undefined);
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shared hosting accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServers();
    refresh();
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [selectedServerId]);

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

  async function handleResync() {
    if (!selectedServerId) return;
    const server = servers.find(s => s.id === selectedServerId);
    if (!server || server.type !== "plesk") return;

    setSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.syncSharedHostingServer(selectedServerId);
      if (result.success) {
        let message = `Synced ${result.syncedDomainsCount} new domains from ${result.domainsCount} available`;
        if (result.removedDomainsCount && result.removedDomainsCount > 0) {
          message += `, removed ${result.removedDomainsCount} stale`;
        }
        setSuccess(message);
        await refresh();
      } else {
        setError(result.error || "Sync failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const selectedServer = servers.find(s => s.id === selectedServerId);

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
          <h1 className="text-2xl font-display font-bold text-white">Shared Hosting</h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor domains on shared hosting accounts. Track HTTP availability, DNS changes, and SSL certificate expiry.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-neon-violet/20 to-neon-cyan/10 text-neon-violet">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
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

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-4 py-3 text-sm text-neon-emerald"
        >
          {success}
        </motion.div>
      )}

      {/* Server Filter */}
      {servers.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="server-filter" className="text-sm text-slate-400">Filter by server:</label>
          <select
            id="server-filter"
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className={selectClasses}
          >
            <option value="">All Servers</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.type === "plesk" ? "Plesk" : server.type === "cyberpanel" ? "CyberPanel" : "Manual"})
              </option>
            ))}
          </select>
          {selectedServerId && (
            <button
              type="button"
              onClick={() => setSelectedServerId("")}
              className="text-sm text-neon-cyan hover:underline"
            >
              Clear filter
            </button>
          )}
          {selectedServer?.type === "plesk" && (
            <button
              type="button"
              onClick={handleResync}
              disabled={syncing}
              className="ml-auto rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 px-4 py-2 text-sm font-medium text-neon-cyan transition-all hover:bg-neon-cyan/20 disabled:opacity-50"
            >
              {syncing ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Syncing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Resync from Plesk
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Create Account Form */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h2 className="font-medium text-white">Add Shared Hosting Account</h2>
        </div>
        <form onSubmit={onCreate} className="flex gap-3">
          <input
            type="text"
            placeholder="Account name (e.g., Hostinger, Bluehost)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClasses + " flex-1"}
          />
          <button type="submit" disabled={creating || !name.trim()} className={primaryBtnClasses}>
            {creating ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating...
              </span>
            ) : (
              "Add Account"
            )}
          </button>
        </form>
      </div>

      {/* Accounts List */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
          <p className="mt-3 text-sm text-slate-400">Loading accounts...</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-slate-700/30 bg-obsidian-800/30 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div className="mt-4 text-sm font-medium text-slate-400">No shared hosting accounts yet</div>
          <div className="mt-1 text-xs text-slate-500">Create one above to start monitoring domains</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account, idx) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 shadow-xl backdrop-blur-sm transition-all hover:border-slate-600/50 hover:bg-obsidian-800/60"
            >
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    to={`/shared-hosting/${account.id}`}
                    className="text-lg font-medium text-white transition-colors group-hover:text-neon-cyan"
                  >
                    {account.name}
                  </Link>
                  {account.server && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${account.server.type === "plesk" ? "bg-neon-violet/10 text-neon-violet" : account.server.type === "cyberpanel" ? "bg-neon-amber/10 text-neon-amber" : "bg-slate-700 text-slate-400"}`}>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                        </svg>
                        {account.server.name}
                      </span>
                    </div>
                  )}
                  {account.pleskLogin && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Customer: {account.pleskLogin}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(account.id)}
                  className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-neon-rose/10 hover:text-neon-rose"
                  title="Delete account"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700/50">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <span>{account.domainCount} domain{account.domainCount !== 1 ? "s" : ""}</span>
                </div>

                {account.issuesCount > 0 && (
                  <div className="flex items-center gap-2 text-neon-amber">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neon-amber/10">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <span>{account.issuesCount} issue{account.issuesCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-slate-500">
                Created {formatDateTime(account.createdAt)}
              </div>

              <Link
                to={`/shared-hosting/${account.id}`}
                className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white"
              >
                View Domains
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
