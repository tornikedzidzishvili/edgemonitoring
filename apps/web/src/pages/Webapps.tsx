import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import { api, type ServerInfo, type WebAppSummary } from "../lib/api";
import { formatDateTime, formatPct } from "../lib/format";

export default function Webapps() {
  const [items, setItems] = useState<WebAppSummary[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [serverId, setServerId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.webapps().then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    api.servers().then(setServers).catch(() => {
      // Non-fatal.
    });
  }, []);

  const serverOptions = useMemo(() => servers, [servers]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.adminCreateWebapp({
        name,
        url,
        serverId: serverId || undefined
      });
      setName("");
      setUrl("");
      // Refresh list
      const refreshed = await api.webapps();
      setItems(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webapp");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Webapps</h1>
        <p className="text-sm text-slate-600">All monitored webapps.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}

      <form onSubmit={onCreate} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="font-medium">Add webapp</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <div className="text-xs text-slate-600">Name</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Frontend"
              required
            />
          </label>
          <label className="block md:col-span-2">
            <div className="text-xs text-slate-600">URL or IP[:port]</div>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="10.0.0.12:8080 or https://example.com"
              required
            />
          </label>
          <label className="block md:col-span-2">
            <div className="text-xs text-slate-600">Attach to server (optional)</div>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              aria-label="Attach to server"
            >
              <option value="">No server</option>
              {serverOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2 md:flex md:items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Adding…" : "Add webapp"}
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">Tip: you can paste an IP like <span className="font-medium">10.0.0.12:8080</span>.</div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uptime 24h</th>
              <th className="px-4 py-3">Uptime 7d</th>
              <th className="px-4 py-3">Last check</th>
              <th className="px-4 py-3">Server</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  <Link to={`/webapps/${w.id}`} className="font-medium text-slate-900 hover:underline">
                    {w.name}
                  </Link>
                  <div className="text-xs text-slate-500">{w.url}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill ok={w.lastCheck ? w.lastCheck.ok : null} />
                </td>
                <td className="px-4 py-3">{formatPct(w.uptime24h)}</td>
                <td className="px-4 py-3">{formatPct(w.uptime7d)}</td>
                <td className="px-4 py-3">{formatDateTime(w.lastCheck?.checkedAt)}</td>
                <td className="px-4 py-3">{w.server?.name ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-600" colSpan={6}>
                  No webapps yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
