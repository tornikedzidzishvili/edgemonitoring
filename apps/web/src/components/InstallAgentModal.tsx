import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../lib/api";

// ── NDJSON message contract ───────────────────────────────────────────────────

type StatusPhase = "connecting" | "rotating-key" | "running-installer" | "done";

type StatusMsg = { type: "status"; phase: StatusPhase; message: string };
type LogMsg    = { type: "log";    stream: "stdout" | "stderr"; line: string };
type ErrorMsg  = { type: "error";  message: string };
type DoneMsg   = { type: "done";   ok: boolean; exitCode: number | null };

type NdjsonMsg = StatusMsg | LogMsg | ErrorMsg | DoneMsg;

// ── Internal log entry ────────────────────────────────────────────────────────

type LogEntry =
  | { kind: "status"; phase: StatusPhase; message: string }
  | { kind: "log";    stream: "stdout" | "stderr"; line: string }
  | { kind: "error";  message: string };

// Scrub api keys from any line before rendering
function scrubSecrets(line: string): string {
  return line.replace(/--api-key\s+\S+/g, "--api-key [REDACTED]");
}

// ── Auth helper ───────────────────────────────────────────────────────────────

const TOKEN_KEY = "edge_monitoring_token";
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Phase label map ───────────────────────────────────────────────────────────

const PHASE_LABELS: Record<StatusPhase, string> = {
  "connecting":         "Connecting via SSH",
  "rotating-key":       "Rotating agent key",
  "running-installer":  "Running installer",
  "done":               "Complete",
};

// ── Modal stage ───────────────────────────────────────────────────────────────

type Stage = "confirm" | "streaming" | "finished";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InstallAgentModalProps {
  serverId: string;
  serverName: string;
  /** Called after a successful install so the parent can refetch the server list */
  onSuccess?: () => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InstallAgentModal({
  serverId,
  serverName,
  onSuccess,
  onClose,
}: InstallAgentModalProps) {
  const [stage, setStage]           = useState<Stage>("confirm");
  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [currentPhase, setPhase]    = useState<StatusPhase>("connecting");
  const [result, setResult]         = useState<DoneMsg | null>(null);
  const [startedAt, setStartedAt]   = useState<number>(0);
  const [elapsed, setElapsed]       = useState(0);
  const [preflightErr, setPreflightErr] = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const isStreaming = stage === "streaming";

  // Auto-scroll to bottom as new lines arrive
  useEffect(() => {
    if (!logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [entries]);

  // Elapsed-time ticker while streaming
  useEffect(() => {
    if (stage !== "streaming") return;
    const tick = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(tick);
  }, [stage, startedAt]);

  // ── Stream installer ────────────────────────────────────────────────────────

  const startInstall = useCallback(async () => {
    setPreflightErr(null);
    setEntries([]);
    setResult(null);
    setPhase("connecting");
    const now = Date.now();
    setStartedAt(now);
    setElapsed(0);
    setStage("streaming");

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/admin/servers/${encodeURIComponent(serverId)}/install-agent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({}),
      });
    } catch (err) {
      setStage("confirm");
      setPreflightErr(err instanceof Error ? err.message : "Network error");
      return;
    }

    // Non-streaming error response (400 / 404 / 403)
    if (!res.ok || res.headers.get("content-type")?.includes("application/json")) {
      const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
      setStage("confirm");
      setPreflightErr(data.message ?? data.error ?? `Server returned ${res.status}`);
      return;
    }

    // Streaming NDJSON body
    const reader = res.body?.getReader();
    if (!reader) {
      setStage("confirm");
      setPreflightErr("No readable stream returned by the server.");
      return;
    }

    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        // Keep last (potentially partial) chunk in the buffer
        buf = lines.pop() ?? "";

        for (const raw of lines) {
          const trimmed = raw.trim();
          if (!trimmed) continue;

          let msg: NdjsonMsg;
          try {
            msg = JSON.parse(trimmed) as NdjsonMsg;
          } catch {
            continue;
          }

          if (msg.type === "status") {
            setPhase(msg.phase);
            setEntries((prev) => [...prev, { kind: "status", phase: msg.phase, message: msg.message }]);
          } else if (msg.type === "log") {
            setEntries((prev) => [...prev, { kind: "log", stream: msg.stream, line: scrubSecrets(msg.line) }]);
          } else if (msg.type === "error") {
            setEntries((prev) => [...prev, { kind: "error", message: msg.message }]);
          } else if (msg.type === "done") {
            setResult(msg);
            setStage("finished");
            if (msg.ok) onSuccess?.();
          }
        }
      }
    } catch {
      setEntries((prev) => [...prev, { kind: "error", message: "Stream interrupted unexpectedly." }]);
      setStage("finished");
    } finally {
      reader.releaseLock();
    }
  }, [serverId, onSuccess]);

  // ── Copy log ─────────────────────────────────────────────────────────────────

  function buildTranscript(): string {
    return entries.map((e) => {
      if (e.kind === "status") return `[PHASE: ${e.phase}] ${e.message}`;
      if (e.kind === "log")    return `[${e.stream.toUpperCase()}] ${e.line}`;
      if (e.kind === "error")  return `[ERROR] ${e.message}`;
      return "";
    }).join("\n");
  }

  async function copyLog() {
    await navigator.clipboard.writeText(buildTranscript());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Elapsed formatter ─────────────────────────────────────────────────────────

  function fmtElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  // ── Dismiss handler ───────────────────────────────────────────────────────────

  function handleBackdropClick() {
    if (isStreaming) return; // non-dismissable while streaming
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        {/* Panel */}
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full rounded-2xl border border-slate-700/50 bg-obsidian-800/95 shadow-2xl backdrop-blur-xl ${
            stage === "confirm" ? "max-w-lg" : "max-w-3xl"
          }`}
        >
          {/* ── Confirm Stage ─────────────────────────────────────────────── */}
          {stage === "confirm" && (
            <div className="p-6">
              {/* Header */}
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neon-amber/10">
                  {/* Download icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Install Agent</h2>
                  <p className="text-xs text-slate-400">{serverName}</p>
                </div>
              </div>

              {/* Preflight error */}
              {preflightErr && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
                >
                  {preflightErr}
                </motion.div>
              )}

              {/* Warning notices */}
              <div className="mb-5 space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-neon-amber/20 bg-neon-amber/5 px-4 py-3">
                  {/* Triangle warning icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-neon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-sm text-neon-amber/90">
                    This will rotate the agent API key on this server. Any existing agent on the host will stop reporting until the new key is applied.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-700/40 bg-obsidian-700/30 px-4 py-3">
                  {/* Info icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-sm text-slate-400">
                    Requires <span className="font-mono text-slate-300">docker</span> and{" "}
                    <span className="font-mono text-slate-300">docker compose</span> to be installed on the target host.
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={startInstall}
                  className="rounded-lg border border-neon-amber/40 bg-neon-amber/15 px-5 py-2.5 text-sm font-semibold text-neon-amber shadow-lg shadow-neon-amber/10 transition-all hover:bg-neon-amber/25 hover:shadow-neon-amber/20"
                >
                  Install agent
                </button>
              </div>
            </div>
          )}

          {/* ── Streaming / Finished Stage ────────────────────────────────── */}
          {(stage === "streaming" || stage === "finished") && (
            <div className="flex flex-col" style={{ minHeight: "420px", maxHeight: "90vh" }}>
              {/* Modal header */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-700/50 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Terminal icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700/40">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white truncate">{serverName}</span>
                      {/* Phase badge */}
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        stage === "finished" && result?.ok
                          ? "border-neon-emerald/30 bg-neon-emerald/10 text-neon-emerald"
                          : stage === "finished" && !result?.ok
                          ? "border-neon-rose/30 bg-neon-rose/10 text-neon-rose"
                          : "border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan"
                      }`}>
                        {stage === "streaming" && (
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan" />
                        )}
                        {stage === "finished" && result?.ok && "Agent installed"}
                        {stage === "finished" && !result?.ok && `Install failed (exit ${result?.exitCode ?? "?"})`}
                        {stage === "streaming" && PHASE_LABELS[currentPhase]}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmtElapsed(stage === "streaming" ? elapsed : Date.now() - startedAt)}
                      {stage === "finished" && " elapsed"}
                    </div>
                  </div>
                </div>

                {/* Header actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={copyLog}
                    className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white"
                  >
                    {copied ? "Copied!" : "Copy log"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isStreaming}
                    className="rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Post-install note */}
              {stage === "finished" && result?.ok && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 border-b border-neon-emerald/20 bg-neon-emerald/5 px-5 py-2.5 text-xs text-neon-emerald/90"
                >
                  Agent reporting expected within ~30s. Watch <span className="font-mono">lastSeenAt</span> on the server list.
                </motion.div>
              )}

              {/* Terminal log area */}
              <div
                ref={logContainerRef}
                className="flex-1 overflow-y-auto bg-[#0d1117] px-5 py-4 font-mono text-xs leading-relaxed"
                style={{ scrollBehavior: "smooth" }}
              >
                {entries.length === 0 && isStreaming && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Connecting...
                  </div>
                )}

                {entries.map((entry, idx) => {
                  if (entry.kind === "status") {
                    return (
                      <div key={idx} className="mb-1 flex items-center gap-2 font-semibold text-neon-cyan">
                        {/* Chevron right */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>{entry.message}</span>
                      </div>
                    );
                  }
                  if (entry.kind === "log") {
                    return (
                      <div
                        key={idx}
                        className={`leading-5 whitespace-pre-wrap break-all ${
                          entry.stream === "stderr" ? "text-rose-400/80" : "text-slate-400"
                        }`}
                      >
                        {entry.line}
                      </div>
                    );
                  }
                  if (entry.kind === "error") {
                    return (
                      <div key={idx} className="my-1 font-semibold text-neon-rose">
                        [ERROR] {entry.message}
                      </div>
                    );
                  }
                  return null;
                })}

                {/* Blinking cursor while streaming */}
                {isStreaming && (
                  <span className="inline-block h-3.5 w-2 animate-pulse bg-slate-400 opacity-70" />
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
