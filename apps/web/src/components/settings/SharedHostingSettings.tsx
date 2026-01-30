import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, type SharedHostingServerDetail, type PleskAvailableDomain, type SyncedDomain } from "../../lib/api";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const selectClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const secondaryBtnClasses =
  "rounded-lg border border-slate-600 bg-obsidian-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-slate-500 hover:bg-obsidian-700 disabled:opacity-50";

const dangerBtnClasses =
  "rounded-lg bg-neon-rose/10 border border-neon-rose/30 px-4 py-2.5 text-sm font-medium text-neon-rose transition-all hover:bg-neon-rose/20 disabled:opacity-50";

type ServerModalMode = "create" | "edit" | "domains";

export default function SharedHostingSettings() {
  const [servers, setServers] = useState<SharedHostingServerDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ServerModalMode>("create");
  const [editingServer, setEditingServer] = useState<SharedHostingServerDetail | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"plesk" | "manual">("plesk");
  const [formApiUrl, setFormApiUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formSyncAll, setFormSyncAll] = useState(true);
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Domain selection state
  const [availableDomains, setAvailableDomains] = useState<PleskAvailableDomain[]>([]);
  const [syncedDomains, setSyncedDomains] = useState<SyncedDomain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  async function loadServers() {
    try {
      setLoading(true);
      const data = await api.sharedHostingServers();
      setServers(data.servers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServers();
  }, []);

  function resetForm() {
    setFormName("");
    setFormType("plesk");
    setFormApiUrl("");
    setFormApiKey("");
    setFormUsername("");
    setFormPassword("");
    setFormSyncAll(true);
    setFormEnabled(true);
    setEditingServer(null);
    setAvailableDomains([]);
    setSyncedDomains([]);
    setSelectedDomains(new Set());
  }

  function openCreateModal() {
    resetForm();
    setModalMode("create");
    setModalOpen(true);
  }

  function openEditModal(server: SharedHostingServerDetail) {
    setEditingServer(server);
    setFormName(server.name);
    setFormType(server.type as "plesk" | "manual");
    setFormApiUrl(server.apiUrl || "");
    setFormApiKey("");
    setFormUsername("");
    setFormPassword("");
    setFormSyncAll(server.syncAll);
    setFormEnabled(server.enabled);
    setModalMode("edit");
    setModalOpen(true);
  }

  async function openDomainsModal(server: SharedHostingServerDetail) {
    setEditingServer(server);
    setModalMode("domains");
    setModalOpen(true);
    setLoadingDomains(true);
    setError(null);

    try {
      const [availableRes, syncedRes] = await Promise.all([
        api.getAvailableDomains(server.id),
        api.getSyncedDomains(server.id)
      ]);

      if (availableRes.success) {
        setAvailableDomains(availableRes.domains);
      } else {
        setError(availableRes.error || "Failed to fetch available domains");
      }
      setSyncedDomains(syncedRes.domains);

      // Pre-select domains that are already synced
      const syncedNames = new Set(syncedRes.domains.map(d => d.domain));
      setSelectedDomains(syncedNames);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load domains");
    } finally {
      setLoadingDomains(false);
    }
  }

  async function handleSaveServer(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (modalMode === "create") {
        await api.createSharedHostingServer({
          name: formName.trim(),
          type: formType,
          apiUrl: formApiUrl.trim() || undefined,
          apiKey: formApiKey.trim() || undefined,
          username: formUsername.trim() || undefined,
          password: formPassword.trim() || undefined,
          syncAll: formSyncAll,
          enabled: formEnabled
        });
        setSuccess("Server created successfully");
      } else if (modalMode === "edit" && editingServer) {
        await api.updateSharedHostingServer(editingServer.id, {
          name: formName.trim(),
          type: formType,
          apiUrl: formApiUrl.trim() || null,
          apiKey: formApiKey.trim() || undefined,
          username: formUsername.trim() || undefined,
          password: formPassword.trim() || undefined,
          syncAll: formSyncAll,
          enabled: formEnabled
        });
        setSuccess("Server updated successfully");
      }

      setModalOpen(false);
      resetForm();
      await loadServers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save server");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    // Test connection using form values (works for both create and edit modes)
    if (!formApiUrl.trim()) {
      setError("API URL is required to test connection");
      return;
    }

    if (!formApiKey.trim() && (!formUsername.trim() || !formPassword.trim())) {
      setError("Either API key or username/password is required");
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.testSharedHostingConnection({
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim() || undefined,
        username: formUsername.trim() || undefined,
        password: formPassword.trim() || undefined
      });
      if (result.ok) {
        setSuccess(result.message);
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncDomains() {
    if (!editingServer) return;

    setSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const selectedArray = formSyncAll ? undefined : Array.from(selectedDomains);
      const result = await api.syncSharedHostingServer(editingServer.id, selectedArray);

      if (result.success) {
        let message = `Synced ${result.syncedDomainsCount} new domains from ${result.domainsCount} available (${result.customersCount} customers)`;
        if (result.removedDomainsCount && result.removedDomainsCount > 0) {
          message += `, removed ${result.removedDomainsCount} stale domains`;
        }
        setSuccess(message);
        await loadServers();
        // Refresh synced domains
        const syncedRes = await api.getSyncedDomains(editingServer.id);
        setSyncedDomains(syncedRes.domains);
      } else {
        setError(result.error || "Sync failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeleteServer(server: SharedHostingServerDetail) {
    if (!confirm(`Delete server "${server.name}" and unlink all its domains?`)) return;

    setError(null);
    try {
      await api.deleteSharedHostingServer(server.id);
      await loadServers();
      setSuccess("Server deleted successfully");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete server");
    }
  }

  function toggleDomainSelection(domain: string) {
    const newSet = new Set(selectedDomains);
    if (newSet.has(domain)) {
      newSet.delete(domain);
    } else {
      newSet.add(domain);
    }
    setSelectedDomains(newSet);
  }

  function selectAllDomains() {
    setSelectedDomains(new Set(availableDomains.map(d => d.name)));
  }

  function deselectAllDomains() {
    setSelectedDomains(new Set());
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Shared Hosting Servers</h2>
          <p className="mt-1 text-sm text-slate-400">
            Connect to Plesk servers to automatically import and monitor domains
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className={primaryBtnClasses}>
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Server
          </span>
        </button>
      </div>

      {/* Messages */}
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

      {/* Servers List */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
          <p className="mt-3 text-sm text-slate-400">Loading servers...</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="rounded-xl border border-slate-700/30 bg-obsidian-800/30 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/30">
            <svg className="h-7 w-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div className="mt-4 text-sm font-medium text-slate-400">No shared hosting servers configured</div>
          <div className="mt-1 text-xs text-slate-500">Add a Plesk server to import domains automatically</div>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map((server) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${server.enabled ? "bg-neon-cyan/10" : "bg-slate-700/50"}`}>
                    {server.type === "plesk" ? (
                      <svg className={`h-5 w-5 ${server.enabled ? "text-neon-cyan" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                      </svg>
                    ) : (
                      <svg className={`h-5 w-5 ${server.enabled ? "text-neon-cyan" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">{server.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${server.type === "plesk" ? "bg-neon-violet/10 text-neon-violet" : "bg-slate-700 text-slate-400"}`}>
                        {server.type === "plesk" ? "Plesk" : "Manual"}
                      </span>
                      {!server.enabled && (
                        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                          Disabled
                        </span>
                      )}
                    </div>
                    {server.apiUrl && (
                      <p className="mt-0.5 text-xs text-slate-500">{server.apiUrl}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {server.type === "plesk" && (
                    <button
                      type="button"
                      onClick={() => openDomainsModal(server)}
                      className={secondaryBtnClasses + " flex items-center gap-2"}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Sync
                    </button>
                  )}
                  <button type="button" onClick={() => openEditModal(server)} className={secondaryBtnClasses}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDeleteServer(server)} className={dangerBtnClasses}>
                    Delete
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-slate-500">Accounts:</span>
                  <span className="font-medium text-white">{server.accountsCount}</span>
                </div>
                {server.lastSyncAt && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-500">Last sync:</span>
                    <span>{new Date(server.lastSyncAt).toLocaleString()}</span>
                  </div>
                )}
                {server.lastSyncError && (
                  <div className="flex items-center gap-2 text-neon-rose">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs">{server.lastSyncError}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-4 w-full max-w-2xl rounded-2xl border border-slate-700/50 bg-obsidian-900 p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {modalMode === "create" && "Add Shared Hosting Server"}
                {modalMode === "edit" && "Edit Shared Hosting Server"}
                {modalMode === "domains" && `Sync Domains - ${editingServer?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-700/50 hover:text-white"
                title="Close modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Create/Edit Form */}
            {(modalMode === "create" || modalMode === "edit") && (
              <form onSubmit={handleSaveServer} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Server Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Production Plesk"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className={inputClasses}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="server-type" className="mb-1.5 block text-sm font-medium text-slate-300">Type</label>
                    <select
                      id="server-type"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as "plesk" | "manual")}
                      className={selectClasses}
                    >
                      <option value="plesk">Plesk</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                </div>

                {formType === "plesk" && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-300">API URL</label>
                      <input
                        type="url"
                        placeholder="https://plesk.example.com:8443"
                        value={formApiUrl}
                        onChange={(e) => setFormApiUrl(e.target.value)}
                        className={inputClasses}
                      />
                      <p className="mt-1 text-xs text-slate-500">Include port if not default (usually :8443)</p>
                    </div>

                    <div className="rounded-lg border border-slate-700/50 bg-obsidian-800/50 p-4">
                      <p className="mb-3 text-sm font-medium text-slate-300">Authentication (choose one method)</p>

                      {/* Show saved credentials status in edit mode */}
                      {modalMode === "edit" && editingServer && (editingServer.hasApiKey || editingServer.hasCredentials) && (
                        <div className="mb-4 rounded-lg border border-neon-cyan/30 bg-neon-cyan/5 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-slate-300">
                              <span className="font-medium">Saved credentials: </span>
                              {editingServer.hasApiKey && <span className="text-neon-cyan">API Key ✓</span>}
                              {editingServer.hasApiKey && editingServer.hasCredentials && <span className="text-slate-500"> + </span>}
                              {editingServer.hasCredentials && <span className="text-neon-emerald">Username/Password ✓</span>}
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Leave fields empty to keep existing, or enter new values to replace</p>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-sm text-slate-400">
                            API Key
                            {modalMode === "edit" && editingServer?.hasApiKey && (
                              <span className="ml-2 text-neon-cyan">(saved)</span>
                            )}
                          </label>
                          <input
                            type="text"
                            placeholder={modalMode === "edit" && editingServer?.hasApiKey ? "Leave empty to keep existing" : "Enter API key"}
                            value={formApiKey}
                            onChange={(e) => setFormApiKey(e.target.value)}
                            className={inputClasses}
                          />
                        </div>

                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-700" />
                          </div>
                          <div className="relative flex justify-center text-xs">
                            <span className="bg-obsidian-800/50 px-2 text-slate-500">OR use username/password</span>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm text-slate-400">
                              Username
                              {modalMode === "edit" && editingServer?.hasCredentials && (
                                <span className="ml-2 text-neon-emerald">(saved)</span>
                              )}
                            </label>
                            <input
                              type="text"
                              placeholder={modalMode === "edit" && editingServer?.hasCredentials ? "Leave empty to keep" : "admin"}
                              value={formUsername}
                              onChange={(e) => setFormUsername(e.target.value)}
                              className={inputClasses}
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm text-slate-400">
                              Password
                              {modalMode === "edit" && editingServer?.hasCredentials && (
                                <span className="ml-2 text-neon-emerald">(saved)</span>
                              )}
                            </label>
                            <input
                              type="password"
                              placeholder={modalMode === "edit" && editingServer?.hasCredentials ? "Leave empty to keep" : "Password"}
                              value={formPassword}
                              onChange={(e) => setFormPassword(e.target.value)}
                              className={inputClasses}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={formSyncAll}
                      onChange={(e) => setFormSyncAll(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                    />
                    Sync all domains
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={formEnabled}
                      onChange={(e) => setFormEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                    />
                    Enabled
                  </label>
                </div>

                {/* Error/Success in Modal */}
                {error && (
                  <div className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-3 py-2 text-sm text-neon-rose">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-3 py-2 text-sm text-neon-emerald">
                    {success}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <div>
                    {modalMode === "edit" && editingServer && formType === "plesk" && (
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className={secondaryBtnClasses}
                      >
                        {testing ? "Testing..." : "Test Connection"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        resetForm();
                      }}
                      className={secondaryBtnClasses}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className={primaryBtnClasses}>
                      {saving ? "Saving..." : modalMode === "create" ? "Create Server" : "Save Changes"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Domains Selection */}
            {modalMode === "domains" && (
              <div className="space-y-4">
                {loadingDomains ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
                    <p className="mt-3 text-sm text-slate-400">Loading domains from Plesk...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-400">
                        Found {availableDomains.length} domains on server
                        {syncedDomains.length > 0 && ` (${syncedDomains.length} already synced)`}
                      </p>
                      <div className="flex gap-2">
                        <button type="button" onClick={selectAllDomains} className="text-xs text-neon-cyan hover:underline">
                          Select All
                        </button>
                        <span className="text-slate-600">|</span>
                        <button type="button" onClick={deselectAllDomains} className="text-xs text-neon-cyan hover:underline">
                          Deselect All
                        </button>
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-700/50 bg-obsidian-800/50">
                      {availableDomains.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-500">
                          No domains found on this server
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-700/50">
                          {availableDomains.map((domain) => {
                            const isSynced = syncedDomains.some(d => d.domain === domain.name);
                            const isSelected = selectedDomains.has(domain.name);

                            return (
                              <label
                                key={domain.name}
                                className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-obsidian-700/50 ${isSelected ? "bg-neon-cyan/5" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleDomainSelection(domain.name)}
                                  className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">{domain.name}</span>
                                    {isSynced && (
                                      <span className="rounded-full bg-neon-emerald/10 px-2 py-0.5 text-xs text-neon-emerald">
                                        Synced
                                      </span>
                                    )}
                                  </div>
                                  {domain.owner && (
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {domain.owner}
                                      {domain.ownerEmail && ` • ${domain.ownerEmail}`}
                                    </p>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500">{domain.hostingType}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Error/Success in Modal */}
                    {error && (
                      <div className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-3 py-2 text-sm text-neon-rose">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-3 py-2 text-sm text-neon-emerald">
                        {success}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          resetForm();
                        }}
                        className={secondaryBtnClasses}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleSyncDomains}
                        disabled={syncing || (selectedDomains.size === 0 && !editingServer?.syncAll)}
                        className={primaryBtnClasses}
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
                          `Sync ${selectedDomains.size > 0 ? `${selectedDomains.size} Selected` : "All"} Domains`
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
