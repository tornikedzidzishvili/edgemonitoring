import { useState, useEffect, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type AgentInstallSettingsResponse } from "../../lib/api";

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const dangerBtnClasses =
  "rounded-lg border border-neon-rose/50 bg-neon-rose/10 px-4 py-2.5 text-sm font-medium text-neon-rose transition-all hover:bg-neon-rose/20 disabled:opacity-50 disabled:cursor-not-allowed";

export default function RegistryCredentialsSection() {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Form state
  const [registryUrl, setRegistryUrl] = useState("ghcr.io");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.agentInstallSettings();
      setConfigured(data.configured);
      setRegistryUrl(data.registryUrl || "ghcr.io");
      setUsername(data.username || "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load registry settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      // Only include token in the payload if the user actually typed one
      const payload: Parameters<typeof api.saveAgentInstallSettings>[0] = {
        registryUrl: registryUrl || "ghcr.io",
        username: username || null,
      };
      if (token) {
        payload.token = token;
      }

      const data = await api.saveAgentInstallSettings(payload);
      setConfigured(data.configured);
      setRegistryUrl(data.registryUrl || "ghcr.io");
      setUsername(data.username || "");
      setToken(""); // always clear — write-only field
      setSuccess("Registry credentials saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save registry credentials");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setError("");
    setSuccess("");
    setClearing(true);

    try {
      const data = await api.saveAgentInstallSettings({ username: null, token: null });
      setConfigured(data.configured);
      setUsername("");
      setToken("");
      setConfirmClear(false);
      setSuccess("Registry credentials cleared");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear registry credentials");
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading registry settings...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Container registry credentials</h2>
          <p className="mt-1 text-sm text-slate-400">
            Used by Install agent to authenticate{" "}
            <code className="rounded bg-obsidian-700 px-1 py-0.5 text-xs font-mono text-slate-300">docker pull</code>{" "}
            on customer servers. Required when the agent image is in a private registry.
          </p>
        </div>

        <div className="shrink-0 pt-0.5">
          {configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-emerald/30 bg-neon-emerald/10 px-3 py-1 text-xs font-medium text-neon-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-emerald" />
              Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/50 bg-slate-700/30 px-3 py-1 text-xs font-medium text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              Not configured
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
          >
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-4 py-3 text-sm text-neon-emerald"
          >
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="registryUrl" className={labelClasses}>
              Registry URL
            </label>
            <input
              id="registryUrl"
              type="text"
              value={registryUrl}
              onChange={(e) => setRegistryUrl(e.target.value)}
              placeholder="ghcr.io"
              autoComplete="off"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="registryUsername" className={labelClasses}>
              Username
            </label>
            <input
              id="registryUsername"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={configured ? "Leave blank to keep current" : "your-github-username"}
              autoComplete="off"
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label htmlFor="agentRegistryToken" className={labelClasses}>
            Access token{" "}
            {configured && <span className="text-slate-500">(leave blank to keep current)</span>}
          </label>
          <input
            id="agentRegistryToken"
            name="agentRegistryToken"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={configured ? "Leave blank to keep current" : "ghp_xxxxxxxxxxxxxxxxxxxx"}
            autoComplete="off"
            className={inputClasses}
          />
          <p className="mt-2 text-xs text-slate-500">
            GitHub PAT with{" "}
            <code className="rounded bg-obsidian-700 px-1 py-0.5 font-mono text-slate-400">read:packages</code> scope,
            or any other registry&apos;s pull token. Stored encrypted at rest.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {configured && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className={dangerBtnClasses}
            >
              Clear credentials
            </button>
          )}

          <AnimatePresence>
            {confirmClear && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-3"
              >
                <span className="text-sm text-slate-400">Remove all saved credentials?</span>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={clearing}
                  className={dangerBtnClasses}
                >
                  {clearing ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Clearing...
                    </span>
                  ) : (
                    "Yes, clear"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg border border-slate-600/50 px-4 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-slate-700/40 hover:text-white"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="ml-auto">
            <button type="submit" disabled={saving} className={primaryBtnClasses}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Saving...
                </span>
              ) : (
                "Save credentials"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
