import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type ServerInfo, type SshKeyInfo, type SshProbeResult, type MonitoringMode } from "../lib/api";
import { formatDateTime } from "../lib/format";
import InstallAgentModal from "../components/InstallAgentModal";

export default function Servers() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [sshKeys, setSshKeys] = useState<SshKeyInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [savingServerId, setSavingServerId] = useState<string | null>(null);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editIp, setEditIp] = useState("");
  const [editVendor, setEditVendor] = useState("");
  const [editSshUser, setEditSshUser] = useState("");
  const [editSshPort, setEditSshPort] = useState("22");
  const [editSshKeyId, setEditSshKeyId] = useState<string>("");
  const [editMonitorDocker, setEditMonitorDocker] = useState(true);
  const [editAlertingEnabled, setEditAlertingEnabled] = useState(false);
  const [editMonitoringMode, setEditMonitoringMode] = useState<MonitoringMode>("agent");

  const [creatingKey, setCreatingKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyUsername, setKeyUsername] = useState("");
  const [keyPort, setKeyPort] = useState("22");
  const [keyPrivateKey, setKeyPrivateKey] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");

  const [creatingServer, setCreatingServer] = useState(false);
  const [serverName, setServerName] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [serverVendor, setServerVendor] = useState("");
  const [serverSshUser, setServerSshUser] = useState("");
  const [serverSshPort, setServerSshPort] = useState("22");
  const [serverSshKeyId, setServerSshKeyId] = useState<string>("");
  const [serverMonitorDocker, setServerMonitorDocker] = useState(true);
  const [serverCreateAgentKey, setServerCreateAgentKey] = useState(true);
  const [serverMonitoringMode, setServerMonitoringMode] = useState<MonitoringMode>("agent");
  const [agentKeyOnce, setAgentKeyOnce] = useState<{ serverId: string; apiKey: string } | null>(null);

  // Test SSH connection state (for the edit-mode row)
  type TestSshState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; latencyMs: number }
    | { status: "error"; message: string };
  const [testSshState, setTestSshState] = useState<Record<string, TestSshState>>({});

  const [generatingKeyFor, setGeneratingKeyFor] = useState<string | null>(null);

  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<SshProbeResult | null>(null);

  const [installTarget, setInstallTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    api.servers().then(setServers).catch(() => {
      // Non-fatal.
    });
  }, []);

  const sshKeyOptions = useMemo(() => sshKeys, [sshKeys]);

  async function refreshSshKeys() {
    try {
      const keys = await api.adminListSshKeys();
      setSshKeys(keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SSH keys");
    }
  }

  async function refreshServers() {
    try {
      const s = await api.servers();
      setServers(s);
    } catch {
      // ignore
    }
  }

  async function onCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatingKey(true);
    try {
      await api.adminCreateSshKey({
        name: keyName,
        username: keyUsername || undefined,
        port: keyPort ? Number(keyPort) : undefined,
        privateKey: keyPrivateKey,
        passphrase: keyPassphrase || undefined
      });
      setKeyName("");
      setKeyUsername("");
      setKeyPort("22");
      setKeyPrivateKey("");
      setKeyPassphrase("");
      await refreshSshKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create SSH key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function onCreateServer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatingServer(true);
    try {
      const created = await api.adminCreateServer({
        name: serverName,
        ip: serverIp || undefined,
        vendor: serverVendor || undefined,
        specs: { monitorDocker: serverMonitorDocker },
        sshUser: serverSshUser || undefined,
        sshPort: serverSshPort ? Number(serverSshPort) : undefined,
        sshKeyId: serverSshKeyId || undefined,
        monitoringMode: serverMonitoringMode,
        createAgentKey: serverMonitoringMode === "agent" ? serverCreateAgentKey : false
      });
      if (created.apiKey) {
        setAgentKeyOnce({ serverId: created.server.id, apiKey: created.apiKey });
      }
      setServerName("");
      setServerIp("");
      setServerVendor("");
      setServerSshUser("");
      setServerSshPort("22");
      setServerSshKeyId("");
      setServerMonitorDocker(true);
      setServerCreateAgentKey(true);
      setServerMonitoringMode("agent");
      await refreshServers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create server");
    } finally {
      setCreatingServer(false);
    }
  }

  async function onGenerateAgentKey(serverId: string) {
    setError(null);
    setGeneratingKeyFor(serverId);
    try {
      const res = await api.adminGenerateServerAgentKey({ id: serverId });
      setAgentKeyOnce({ serverId: res.serverId, apiKey: res.apiKey });
      await refreshServers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate agent key");
    } finally {
      setGeneratingKeyFor(null);
    }
  }

  async function onProbe(serverId: string) {
    setError(null);
    setProbeResult(null);
    setProbingId(serverId);
    try {
      const res = await api.adminProbeServer({ id: serverId });
      setProbeResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Probe failed");
    } finally {
      setProbingId(null);
    }
  }

  async function startEdit(s: ServerInfo) {
    setError(null);
    setEditingServerId(s.id);
    setEditName(s.name ?? "");
    setEditIp(s.ip ?? "");
    setEditVendor(s.vendor ?? "");
    setEditSshUser(s.sshUser ?? "");
    setEditSshPort(s.sshPort ? String(s.sshPort) : "22");
    setEditSshKeyId(s.sshKeyId ?? "");
    setEditMonitoringMode(s.monitoringMode ?? "agent");
    // Reset any prior test-ssh result for this server when entering edit
    setTestSshState((prev) => ({ ...prev, [s.id]: { status: "idle" } }));
    const specs = (s.specs && typeof s.specs === "object") ? (s.specs as any) : {};
    setEditMonitorDocker(specs?.monitorDocker !== false);
    try {
      const alertConfig = await api.serverAlertConfig(s.id);
      setEditAlertingEnabled(alertConfig.alertingEnabled);
    } catch {
      setEditAlertingEnabled(false);
    }
  }

  function cancelEdit() {
    setEditingServerId(null);
  }

  async function onSaveEdit() {
    if (!editingServerId) return;
    setError(null);
    setSavingServerId(editingServerId);
    try {
      const current = servers.find((s) => s.id === editingServerId);
      const existingSpecs = (current?.specs && typeof current.specs === "object") ? (current.specs as any) : {};
      await api.adminUpdateServer({
        id: editingServerId,
        name: editName,
        ip: editIp ? editIp : null,
        vendor: editVendor ? editVendor : null,
        sshUser: editSshUser ? editSshUser : null,
        sshPort: editSshPort ? Number(editSshPort) : null,
        sshKeyId: editSshKeyId ? editSshKeyId : null,
        monitoringMode: editMonitoringMode,
        specs: { ...existingSpecs, monitorDocker: editMonitorDocker }
      });
      await api.saveServerAlertConfig(editingServerId, { alertingEnabled: editAlertingEnabled });
      await refreshServers();
      setEditingServerId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update server");
    } finally {
      setSavingServerId(null);
    }
  }

  async function onDeleteServer(serverId: string) {
    const s = servers.find((x) => x.id === serverId);
    const name = s?.name ?? serverId;
    const ok = window.confirm(`Delete server "${name}"? This cannot be undone.`);
    if (!ok) return;

    setError(null);
    setDeletingServerId(serverId);
    try {
      await api.adminDeleteServer({ id: serverId });
      if (editingServerId === serverId) setEditingServerId(null);
      await refreshServers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete server");
    } finally {
      setDeletingServerId(null);
    }
  }

  function mapSshError(raw: string): string {
    if (raw === "auth failure") return "SSH authentication failed — verify the selected key has access on the target server";
    if (raw === "timeout") return "Connection timed out — verify the host IP and SSH port";
    if (raw === "host unreachable") return "Host unreachable — verify the IP address and firewall rules";
    return raw;
  }

  async function onTestSsh(serverId: string) {
    setTestSshState((prev) => ({ ...prev, [serverId]: { status: "loading" } }));
    try {
      const res = await api.adminTestSshConnection(serverId);
      if (res.ok) {
        setTestSshState((prev) => ({ ...prev, [serverId]: { status: "ok", latencyMs: res.latencyMs } }));
      } else {
        setTestSshState((prev) => ({ ...prev, [serverId]: { status: "error", message: mapSshError(res.error) } }));
      }
    } catch (e) {
      // HTTP 4xx from the route itself (e.g. no sshKeyId configured)
      const msg = e instanceof Error ? e.message : "Connection test failed";
      setTestSshState((prev) => ({ ...prev, [serverId]: { status: "error", message: msg } }));
    }
  }

  const inputClasses = "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";
  const labelClasses = "text-xs font-medium text-slate-400";
  const primaryBtnClasses = "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-4 py-2.5 text-sm font-medium text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 disabled:opacity-60";
  const secondaryBtnClasses = "rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:opacity-60";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-display font-bold text-white">Manage Servers</h1>
        <p className="mt-1 text-sm text-slate-400">Inventory, SSH keys, and live probe</p>
      </div>

      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
        >
          {error}
        </motion.div>
      ) : null}

      {agentKeyOnce ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-neon-amber/30 bg-neon-amber/10 p-5 text-sm backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 font-medium text-neon-amber">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            Agent key (shown once)
          </div>
          <div className="mt-2 text-xs text-slate-400">Server: {agentKeyOnce.serverId}</div>
          <pre className="mt-3 overflow-auto rounded-lg border border-slate-700/50 bg-obsidian-900 p-4 font-mono text-xs text-neon-cyan">{agentKeyOnce.apiKey}</pre>
          <div className="mt-4 text-xs text-slate-400">Run the agent on your server with:</div>
          <pre className="mt-2 overflow-auto rounded-lg border border-slate-700/50 bg-obsidian-900 p-4 font-mono text-xs text-slate-300">
{`CENTRAL_API_URL=http://<your-api-host>:4000
SERVER_NAME=<name>
AGENT_API_KEY=${agentKeyOnce.apiKey}
REPORT_INTERVAL_SECONDS=5`}
          </pre>
          <div className="mt-3 text-xs text-slate-400">
            After the agent starts posting reports, open the server details page to see realtime CPU/memory/disk/docker stats.
          </div>
        </motion.div>
      ) : null}

      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-violet/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            </div>
            <span className="font-medium text-white">SSH Keys</span>
          </div>
          <button
            type="button"
            className={secondaryBtnClasses}
            onClick={() => refreshSshKeys()}
          >
            Load SSH keys
          </button>
        </div>
      </div>

      <form onSubmit={onCreateKey} className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-emerald/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="font-medium text-white">Add SSH key (stored encrypted)</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="block">
            <div className={labelClasses}>Name</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="root-key"
              required
            />
          </label>
          <label className="block">
            <div className={labelClasses}>Username (optional)</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={keyUsername}
              onChange={(e) => setKeyUsername(e.target.value)}
              placeholder="root"
            />
          </label>
          <label className="block">
            <div className={labelClasses}>Port (optional)</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={keyPort}
              onChange={(e) => setKeyPort(e.target.value)}
              inputMode="numeric"
              placeholder="22"
            />
          </label>
          <label className="block md:col-span-4">
            <div className={labelClasses}>Private key</div>
            <textarea
              className={inputClasses + " mt-1.5 h-40 font-mono text-xs"}
              value={keyPrivateKey}
              onChange={(e) => setKeyPrivateKey(e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
              required
            />
          </label>
          <label className="block md:col-span-4">
            <div className={labelClasses}>Passphrase (optional)</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={keyPassphrase}
              onChange={(e) => setKeyPassphrase(e.target.value)}
              placeholder="(leave empty if none)"
            />
          </label>
          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={creatingKey}
              className={primaryBtnClasses}
            >
              {creatingKey ? "Saving..." : "Save SSH key"}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={onCreateServer} className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <span className="font-medium text-white">Add server</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="block">
            <div className={labelClasses}>Name</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="hetzner-01"
              required
            />
          </label>
          <label className="block">
            <div className={labelClasses}>IP</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              placeholder="10.0.0.12"
            />
          </label>
          <label className="block">
            <div className={labelClasses}>Vendor</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={serverVendor}
              onChange={(e) => setServerVendor(e.target.value)}
              placeholder="hetzner"
            />
          </label>

          {/* Monitoring Mode segmented control */}
          <div className="block md:col-span-4">
            <div className={labelClasses + " mb-1.5"}>Monitoring Mode</div>
            <div
              className="inline-flex rounded-lg border border-slate-700/50 bg-obsidian-900/60 p-0.5 gap-0.5"
              role="group"
              aria-label="Monitoring mode"
            >
              <button
                type="button"
                onClick={() => setServerMonitoringMode("agent")}
                className={
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-all " +
                  (serverMonitoringMode === "agent"
                    ? "bg-neon-cyan/20 text-neon-cyan shadow-sm"
                    : "text-slate-400 hover:text-slate-200")
                }
              >
                Agent (installed)
              </button>
              <button
                type="button"
                onClick={() => setServerMonitoringMode("ssh")}
                className={
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-all " +
                  (serverMonitoringMode === "ssh"
                    ? "bg-neon-cyan/20 text-neon-cyan shadow-sm"
                    : "text-slate-400 hover:text-slate-200")
                }
              >
                SSH (agentless)
              </button>
            </div>
          </div>

          {/* SSH user/port — shown for both modes (SSH credentials are still useful for agent mode) */}
          <label className="block">
            <div className={labelClasses}>SSH user</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={serverSshUser}
              onChange={(e) => setServerSshUser(e.target.value)}
              placeholder="root"
            />
          </label>
          <label className="block">
            <div className={labelClasses}>SSH port</div>
            <input
              className={inputClasses + " mt-1.5"}
              value={serverSshPort}
              onChange={(e) => setServerSshPort(e.target.value)}
              inputMode="numeric"
              placeholder="22"
            />
          </label>

          {/* SSH key selector */}
          <label className="block md:col-span-2">
            <div className={labelClasses}>
              SSH key{serverMonitoringMode === "ssh" ? <span className="ml-1 text-neon-rose">*</span> : null}
            </div>
            <select
              className={inputClasses + " mt-1.5"}
              value={serverSshKeyId}
              onChange={(e) => setServerSshKeyId(e.target.value)}
              aria-label="SSH key"
              aria-required={serverMonitoringMode === "ssh"}
            >
              <option value="">{serverMonitoringMode === "ssh" ? "Select SSH key" : "(optional) Select SSH key"}</option>
              {sshKeyOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <div className="mt-1.5 text-xs text-slate-500">Click "Load SSH keys" above if empty.</div>
          </label>

          {/* SSH mode — link to key upload */}
          {serverMonitoringMode === "ssh" ? (
            <div className="md:col-span-2 flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-700/40 dark:bg-slate-800/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                Upload your private key under{" "}
                <Link to="/servers/manage" className="font-medium text-slate-300 underline underline-offset-2 hover:text-white dark:text-slate-300 dark:hover:text-white">
                  Settings &gt; SSH Keys
                </Link>{" "}
                first
              </span>
            </div>
          ) : null}

          {serverMonitoringMode === "ssh" && !serverSshKeyId ? (
            <div className="md:col-span-4 rounded-lg border border-neon-amber/30 bg-neon-amber/10 px-3 py-2 text-xs text-neon-amber">
              Select an SSH key to use SSH polling
            </div>
          ) : null}

          {/* Test Connection — disabled in create mode (no server ID yet) */}
          {serverMonitoringMode === "ssh" ? (
            <div className="md:col-span-4 flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Save the server first to enable connection testing"
                className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-3 py-1.5 text-xs font-medium text-slate-500 cursor-not-allowed opacity-60"
              >
                Test Connection
              </button>
              <span className="text-xs text-slate-500">Save the server first to enable connection testing</span>
            </div>
          ) : null}

          {/* Agent-mode only options */}
          {serverMonitoringMode === "agent" ? (
            <>
              <label className="flex items-center gap-3 md:col-span-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                  checked={serverMonitorDocker}
                  onChange={(e) => setServerMonitorDocker(e.target.checked)}
                />
                <span className="text-sm text-slate-300">Monitor Docker (containers + stats)</span>
              </label>
              <label className="flex items-center gap-3 md:col-span-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                  checked={serverCreateAgentKey}
                  onChange={(e) => setServerCreateAgentKey(e.target.checked)}
                />
                <span className="text-sm text-slate-300">Create agent key (required for realtime server stats)</span>
              </label>
            </>
          ) : null}

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={creatingServer || (serverMonitoringMode === "ssh" && !serverSshKeyId)}
              className={primaryBtnClasses}
              title={serverMonitoringMode === "ssh" && !serverSshKeyId ? "Select an SSH key to use SSH polling" : undefined}
            >
              {creatingServer ? "Adding..." : "Add server"}
            </button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-obsidian-800/40 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700/50 bg-obsidian-800/60 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-4">Name</th>
                <th className="px-4 py-4">IP</th>
                <th className="px-4 py-4">Vendor</th>
                <th className="px-4 py-4">SSH key</th>
                <th className="px-4 py-4">Last seen</th>
                <th className="px-4 py-4">Probe</th>
                <th className="px-4 py-4">Agent key</th>
                <th className="px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {servers.map((s, idx) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="transition-colors hover:bg-obsidian-700/30"
                >
                  <td className="px-4 py-4">
                    {editingServerId === s.id ? (
                      <input
                        className={inputClasses + " !py-1.5"}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="Server name"
                        placeholder="Server name"
                        required
                      />
                    ) : (
                      <Link to={`/servers/${s.id}`} className="font-medium text-white transition-colors hover:text-neon-cyan">
                        {s.name}
                      </Link>
                    )}
                    <div className="font-mono text-xs text-slate-500">{s.id}</div>
                  </td>
                  <td className="px-4 py-4">
                    {editingServerId === s.id ? (
                      <input
                        className={inputClasses + " !py-1.5"}
                        value={editIp}
                        onChange={(e) => setEditIp(e.target.value)}
                        placeholder="(optional)"
                      />
                    ) : (
                      <span className="font-mono text-slate-300">{s.ip ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {editingServerId === s.id ? (
                      <input
                        className={inputClasses + " !py-1.5"}
                        value={editVendor}
                        onChange={(e) => setEditVendor(e.target.value)}
                        placeholder="(optional)"
                      />
                    ) : (
                      <span className="text-slate-300">{s.vendor ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {editingServerId === s.id ? (
                      <select
                        className={inputClasses + " !py-1.5"}
                        value={editSshKeyId}
                        onChange={(e) => setEditSshKeyId(e.target.value)}
                        aria-label="SSH key"
                        aria-required={editMonitoringMode === "ssh"}
                      >
                        <option value="">{editMonitoringMode === "ssh" ? "Select SSH key" : "(none)"}</option>
                        {sshKeyOptions.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-mono text-xs text-slate-400">{s.sshKeyId ? s.sshKeyId.slice(0, 8) + "..." : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-400">{formatDateTime(s.lastSeenAt)}</td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => onProbe(s.id)}
                      disabled={probingId === s.id}
                      className="rounded-lg bg-neon-cyan/20 px-3 py-1.5 text-xs font-medium text-neon-cyan transition-all hover:bg-neon-cyan/30 disabled:opacity-60"
                    >
                      {probingId === s.id ? "Probing..." : "Probe"}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => onGenerateAgentKey(s.id)}
                      disabled={generatingKeyFor === s.id}
                      className={secondaryBtnClasses + " !py-1.5 text-xs"}
                    >
                      {generatingKeyFor === s.id ? "Generating..." : "Generate"}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    {editingServerId === s.id ? (
                      <div className="space-y-3 min-w-[260px]">
                        {/* Monitoring mode segmented control */}
                        <div>
                          <div className="mb-1 text-xs font-medium text-slate-400">Monitoring Mode</div>
                          <div
                            className="inline-flex rounded-lg border border-slate-700/50 bg-obsidian-900/60 p-0.5 gap-0.5"
                            role="group"
                            aria-label="Monitoring mode"
                          >
                            <button
                              type="button"
                              onClick={() => setEditMonitoringMode("agent")}
                              className={
                                "rounded-md px-3 py-1 text-xs font-medium transition-all " +
                                (editMonitoringMode === "agent"
                                  ? "bg-neon-cyan/20 text-neon-cyan shadow-sm"
                                  : "text-slate-400 hover:text-slate-200")
                              }
                            >
                              Agent
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditMonitoringMode("ssh")}
                              className={
                                "rounded-md px-3 py-1 text-xs font-medium transition-all " +
                                (editMonitoringMode === "ssh"
                                  ? "bg-neon-cyan/20 text-neon-cyan shadow-sm"
                                  : "text-slate-400 hover:text-slate-200")
                              }
                            >
                              SSH
                            </button>
                          </div>
                        </div>

                        {/* SSH user / port — always visible */}
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className={inputClasses + " !py-1.5"}
                            value={editSshUser}
                            onChange={(e) => setEditSshUser(e.target.value)}
                            placeholder="SSH user"
                          />
                          <input
                            className={inputClasses + " !py-1.5"}
                            value={editSshPort}
                            onChange={(e) => setEditSshPort(e.target.value)}
                            inputMode="numeric"
                            placeholder="22"
                          />
                        </div>

                        {/* Agent-mode extras */}
                        {editMonitoringMode === "agent" ? (
                          <>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                                checked={editMonitorDocker}
                                onChange={(e) => setEditMonitorDocker(e.target.checked)}
                              />
                              <span className="text-xs text-slate-300">Monitor Docker</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-600 bg-obsidian-800 text-neon-cyan focus:ring-neon-cyan/50"
                                checked={editAlertingEnabled}
                                onChange={(e) => setEditAlertingEnabled(e.target.checked)}
                              />
                              <span className="text-xs text-slate-300">Enable Alerting</span>
                            </label>
                          </>
                        ) : null}

                        {/* SSH-mode: Test Connection */}
                        {editMonitoringMode === "ssh" ? (
                          <div className="space-y-1.5">
                            {/* Info callout — link to SSH key management */}
                            <div className="flex items-start gap-1.5 rounded-lg border border-slate-700/40 bg-slate-800/40 px-2.5 py-2 text-xs text-slate-400 dark:border-slate-700/40 dark:bg-slate-800/40">
                              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span>
                                Upload your private key under{" "}
                                <Link to="/servers/manage" className="font-medium text-slate-300 underline underline-offset-2 hover:text-white dark:text-slate-300 dark:hover:text-white">
                                  Settings &gt; SSH Keys
                                </Link>{" "}
                                first
                              </span>
                            </div>
                            {/* Validation hint when no SSH key is selected */}
                            {!editSshKeyId ? (
                              <div className="rounded-lg border border-neon-amber/30 bg-neon-amber/10 px-2.5 py-1.5 text-xs text-neon-amber">
                                Select an SSH key to use SSH polling
                              </div>
                            ) : null}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onTestSsh(s.id)}
                                disabled={(testSshState[s.id]?.status === "loading")}
                                className="rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-1.5 text-xs font-medium text-neon-cyan transition-all hover:bg-neon-cyan/20 disabled:opacity-60"
                              >
                                {testSshState[s.id]?.status === "loading" ? "Testing..." : "Test Connection"}
                              </button>
                              {(() => {
                                const st = testSshState[s.id];
                                if (!st || st.status === "idle" || st.status === "loading") return null;
                                if (st.status === "ok") {
                                  return (
                                    <span className="flex items-center gap-1 text-xs text-neon-emerald">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      Connected ({st.latencyMs}ms)
                                    </span>
                                  );
                                }
                                return (
                                  <span className="flex items-center gap-1 text-xs text-neon-rose">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    {st.message}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onSaveEdit()}
                            disabled={savingServerId === s.id || (editMonitoringMode === "ssh" && !editSshKeyId)}
                            title={editMonitoringMode === "ssh" && !editSshKeyId ? "Select an SSH key to use SSH polling" : undefined}
                            className="rounded-lg bg-neon-emerald/20 px-3 py-1.5 text-xs font-medium text-neon-emerald transition-all hover:bg-neon-emerald/30 disabled:opacity-60"
                          >
                            {savingServerId === s.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEdit()}
                            disabled={savingServerId === s.id}
                            className={secondaryBtnClasses + " !py-1.5 text-xs"}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className={secondaryBtnClasses + " !py-1.5 text-xs"}
                        >
                          Edit
                        </button>
                        {(() => {
                          const canInstall = !!(s.ip && s.sshKeyId);
                          return (
                            <button
                              type="button"
                              onClick={() => canInstall && setInstallTarget({ id: s.id, name: s.name })}
                              disabled={!canInstall}
                              title={!canInstall ? "Requires IP and an SSH key to be set on this server" : "Install monitoring agent via SSH"}
                              className="rounded-lg border border-neon-amber/30 bg-neon-amber/10 px-3 py-1.5 text-xs font-medium text-neon-amber transition-all hover:bg-neon-amber/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Install agent
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => onDeleteServer(s.id)}
                          disabled={deletingServerId === s.id}
                          className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-3 py-1.5 text-xs font-medium text-neon-rose transition-all hover:bg-neon-rose/20 disabled:opacity-60"
                        >
                          {deletingServerId === s.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))}
              {servers.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-400" colSpan={8}>
                    No servers yet. Add a server above to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {probeResult ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <span className="font-medium text-white">Probe result</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {probeResult.serverName} • {probeResult.target.host}:{probeResult.target.port} as {probeResult.target.username}
          </div>
          <pre className="mt-4 overflow-auto rounded-lg border border-slate-700/50 bg-obsidian-900 p-4 font-mono text-xs text-slate-300">
            {JSON.stringify(probeResult, null, 2)}
          </pre>
        </motion.div>
      ) : null}

      {installTarget ? (
        <InstallAgentModal
          serverId={installTarget.id}
          serverName={installTarget.name}
          onSuccess={refreshServers}
          onClose={() => setInstallTarget(null)}
        />
      ) : null}
    </motion.div>
  );
}
