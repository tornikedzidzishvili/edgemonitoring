import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ServerInfo, type SshKeyInfo, type SshProbeResult } from "../lib/api";
import { formatDateTime } from "../lib/format";

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
  const [agentKeyOnce, setAgentKeyOnce] = useState<{ serverId: string; apiKey: string } | null>(null);

  const [generatingKeyFor, setGeneratingKeyFor] = useState<string | null>(null);

  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<SshProbeResult | null>(null);

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
        createAgentKey: serverCreateAgentKey
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

  function startEdit(s: ServerInfo) {
    setError(null);
    setEditingServerId(s.id);
    setEditName(s.name ?? "");
    setEditIp(s.ip ?? "");
    setEditVendor(s.vendor ?? "");
    setEditSshUser(s.sshUser ?? "");
    setEditSshPort(s.sshPort ? String(s.sshPort) : "22");
    setEditSshKeyId(s.sshKeyId ?? "");
    const specs = (s.specs && typeof s.specs === "object") ? (s.specs as any) : {};
    setEditMonitorDocker(specs?.monitorDocker !== false);
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
        specs: { ...existingSpecs, monitorDocker: editMonitorDocker }
      });
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Servers</h1>
        <p className="text-sm text-slate-600">Inventory (IP/vendor/specs) + SSH keys + live probe.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}

      {agentKeyOnce ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="font-medium">Agent key (shown once)</div>
          <div className="mt-1 text-xs text-amber-800">Server: {agentKeyOnce.serverId}</div>
          <pre className="mt-3 overflow-auto rounded-md border border-amber-200 bg-white p-3 text-xs">{agentKeyOnce.apiKey}</pre>
          <div className="mt-3 text-xs text-amber-800">Run the agent on your server with:</div>
          <pre className="mt-2 overflow-auto rounded-md border border-amber-200 bg-white p-3 text-xs">
{`CENTRAL_API_URL=http://<your-api-host>:4000\nSERVER_NAME=<name>\nAGENT_API_KEY=${agentKeyOnce.apiKey}\nREPORT_INTERVAL_SECONDS=5`}
          </pre>
          <div className="mt-2 text-xs text-amber-800">
            After the agent starts posting reports, open the server details page to see realtime CPU/memory/disk/docker stats.
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium">SSH keys</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => refreshSshKeys()}
          >
            Load SSH keys
          </button>
        </div>
      </div>

      <form onSubmit={onCreateKey} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium">Add SSH key (stored encrypted)</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <div className="text-xs text-slate-600">Name</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="root-key"
              required
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600">Username (optional)</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={keyUsername}
              onChange={(e) => setKeyUsername(e.target.value)}
              placeholder="root"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600">Port (optional)</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={keyPort}
              onChange={(e) => setKeyPort(e.target.value)}
              inputMode="numeric"
              placeholder="22"
            />
          </label>
          <label className="block md:col-span-4">
            <div className="text-xs text-slate-600">Private key</div>
            <textarea
              className="mt-1 h-40 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
              value={keyPrivateKey}
              onChange={(e) => setKeyPrivateKey(e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
              required
            />
          </label>
          <label className="block md:col-span-4">
            <div className="text-xs text-slate-600">Passphrase (optional)</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={keyPassphrase}
              onChange={(e) => setKeyPassphrase(e.target.value)}
              placeholder="(leave empty if none)"
            />
          </label>
          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={creatingKey}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creatingKey ? "Saving…" : "Save SSH key"}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={onCreateServer} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium">Add server</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <div className="text-xs text-slate-600">Name</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="hetzner-01"
              required
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600">IP</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              placeholder="10.0.0.12"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600">Vendor</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverVendor}
              onChange={(e) => setServerVendor(e.target.value)}
              placeholder="hetzner"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600">SSH user</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverSshUser}
              onChange={(e) => setServerSshUser(e.target.value)}
              placeholder="root"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600">SSH port</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverSshPort}
              onChange={(e) => setServerSshPort(e.target.value)}
              inputMode="numeric"
              placeholder="22"
            />
          </label>
          <label className="block md:col-span-3">
            <div className="text-xs text-slate-600">SSH key</div>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverSshKeyId}
              onChange={(e) => setServerSshKeyId(e.target.value)}
              aria-label="SSH key"
            >
              <option value="">(optional) Select SSH key</option>
              {sshKeyOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-500">Click “Load SSH keys” above if empty.</div>
          </label>

          <label className="flex items-center gap-2 md:col-span-4">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={serverMonitorDocker}
              onChange={(e) => setServerMonitorDocker(e.target.checked)}
            />
            <span className="text-sm text-slate-700">Monitor Docker (containers + stats)</span>
          </label>

          <label className="flex items-center gap-2 md:col-span-4">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={serverCreateAgentKey}
              onChange={(e) => setServerCreateAgentKey(e.target.checked)}
            />
            <span className="text-sm text-slate-700">Create agent key (required for realtime server stats)</span>
          </label>
          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={creatingServer}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creatingServer ? "Adding…" : "Add server"}
            </button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">SSH key</th>
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3">Probe</th>
              <th className="px-4 py-3">Agent key</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  {editingServerId === s.id ? (
                    <input
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label="Server name"
                      placeholder="Server name"
                      required
                    />
                  ) : (
                    <Link to={`/servers/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.name}
                    </Link>
                  )}
                  <div className="text-xs text-slate-500">{s.id}</div>
                </td>
                <td className="px-4 py-3">
                  {editingServerId === s.id ? (
                    <input
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={editIp}
                      onChange={(e) => setEditIp(e.target.value)}
                      placeholder="(optional)"
                    />
                  ) : (
                    (s.ip ?? "—")
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingServerId === s.id ? (
                    <input
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={editVendor}
                      onChange={(e) => setEditVendor(e.target.value)}
                      placeholder="(optional)"
                    />
                  ) : (
                    (s.vendor ?? "—")
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingServerId === s.id ? (
                    <select
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={editSshKeyId}
                      onChange={(e) => setEditSshKeyId(e.target.value)}
                      aria-label="SSH key"
                    >
                      <option value="">(none)</option>
                      {sshKeyOptions.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (s.sshKeyId ? s.sshKeyId.slice(0, 8) + "…" : "—")
                  )}
                </td>
                <td className="px-4 py-3">{formatDateTime(s.lastSeenAt)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onProbe(s.id)}
                    disabled={probingId === s.id}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {probingId === s.id ? "Probing…" : "Probe"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onGenerateAgentKey(s.id)}
                    disabled={generatingKeyFor === s.id}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {generatingKeyFor === s.id ? "Generating…" : "Generate"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  {editingServerId === s.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                          value={editSshUser}
                          onChange={(e) => setEditSshUser(e.target.value)}
                          placeholder="SSH user"
                        />
                        <input
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                          value={editSshPort}
                          onChange={(e) => setEditSshPort(e.target.value)}
                          inputMode="numeric"
                          placeholder="22"
                        />
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={editMonitorDocker}
                          onChange={(e) => setEditMonitorDocker(e.target.checked)}
                        />
                        <span className="text-xs text-slate-700">Monitor Docker</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onSaveEdit()}
                          disabled={savingServerId === s.id}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {savingServerId === s.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelEdit()}
                          disabled={savingServerId === s.id}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
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
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteServer(s.id)}
                        disabled={deletingServerId === s.id}
                        className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {deletingServerId === s.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {servers.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-600" colSpan={8}>
                  No servers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {probeResult ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="font-medium">Probe result</div>
          <div className="mt-1 text-xs text-slate-500">
            {probeResult.serverName} • {probeResult.target.host}:{probeResult.target.port} as {probeResult.target.username}
          </div>
          <pre className="mt-3 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            {JSON.stringify(probeResult, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
