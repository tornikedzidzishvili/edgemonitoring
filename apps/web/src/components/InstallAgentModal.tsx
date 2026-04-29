import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../lib/api";
import type { DetectStackResponse } from "../types/smartInstall";

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

type Stage = "confirm" | "detecting" | "review" | "streaming" | "finished";

// ── Mode label helper ─────────────────────────────────────────────────────────

function modeLabel(mode: "agent" | "agent_systemd"): string {
  return mode === "agent" ? "agent (Docker)" : "agent_systemd";
}

// ── Rationale helper ──────────────────────────────────────────────────────────

function computeRationale(profile: DetectStackResponse["profile"]): string {
  if (profile.hasCyberPanel) {
    return "CyberPanel detected — installing as a systemd service to avoid Docker on the panel host.";
  }
  if (profile.hasDocker && profile.hasDockerBuildKit) {
    return "Docker with BuildKit — using the containerized agent.";
  }
  if (profile.hasDocker && !profile.hasDockerBuildKit) {
    return "Docker present but no BuildKit — falling back to systemd install.";
  }
  return "No Docker — installing as a systemd service.";
}

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
  const [stage, setStage]               = useState<Stage>("confirm");
  const [entries, setEntries]           = useState<LogEntry[]>([]);
  const [currentPhase, setPhase]        = useState<StatusPhase>("connecting");
  const [result, setResult]             = useState<DoneMsg | null>(null);
  const [startedAt, setStartedAt]       = useState<number>(0);
  const [elapsed, setElapsed]           = useState(0);
  const [preflightErr, setPreflightErr] = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  // Smart-install state
  const [detectResult, setDetectResult] = useState<DetectStackResponse | null>(null);
  const [chosenMode, setChosenMode]     = useState<"agent" | "agent_systemd" | null>(null);

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

  // ── Detect host stack ───────────────────────────────────────────────────────

  const detectStack = useCallback(async () => {
    setPreflightErr(null);
    setDetectResult(null);
    setChosenMode(null);
    setStage("detecting");

    let res: Response;
    try {
      res = await fetch(
        `${API_BASE_URL}/admin/servers/${encodeURIComponent(serverId)}/detect-stack`,
        {
          method: "POST",
          headers: { ...getAuthHeaders() },
        }
      );
    } catch (err) {
      setStage("confirm");
      setPreflightErr(err instanceof Error ? err.message : "Network error");
      return;
    }

    if (!res.ok) {
      let errCode = "";
      try {
        const data = (await res.json()) as { error?: string };
        errCode = data.error ?? "";
      } catch {
        // ignore parse failure
      }
      setStage("confirm");

      if (errCode === "detection-timeout") {
        setPreflightErr("Host did not respond in time. Try again, or override the mode manually.");
      } else if (errCode === "ssh-connect-failed") {
        setPreflightErr("Could not connect over SSH. Check the host is reachable and the SSH key is correct.");
      } else if (errCode === "detection-failed") {
        setPreflightErr("Detection failed unexpectedly. Try again.");
      } else if (
        errCode === "missing-server-ip" ||
        errCode === "missing-ssh-key" ||
        errCode === "missing-ssh-username"
      ) {
        setPreflightErr("Server is not configured for SSH probing — set IP / SSH key first.");
      } else {
        setPreflightErr(`Detection failed: ${res.status}`);
      }
      return;
    }

    let data: DetectStackResponse;
    try {
      data = (await res.json()) as DetectStackResponse;
    } catch {
      setStage("confirm");
      setPreflightErr("Unexpected response from detection endpoint.");
      return;
    }

    setDetectResult(data);
    setChosenMode(data.recommendedMode);
    setStage("review");
  }, [serverId]);

  // ── Stream installer ────────────────────────────────────────────────────────

  const startInstall = useCallback(
    async (monitoringMode: "agent" | "agent_systemd") => {
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
        res = await fetch(
          `${API_BASE_URL}/admin/servers/${encodeURIComponent(serverId)}/install-agent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ monitoringMode }),
          }
        );
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
              setEntries((prev) => [
                ...prev,
                { kind: "status", phase: msg.phase, message: msg.message },
              ]);
            } else if (msg.type === "log") {
              setEntries((prev) => [
                ...prev,
                { kind: "log", stream: msg.stream, line: scrubSecrets(msg.line) },
              ]);
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
        setEntries((prev) => [
          ...prev,
          { kind: "error", message: "Stream interrupted unexpectedly." },
        ]);
        setStage("finished");
      } finally {
        reader.releaseLock();
      }
    },
    [serverId, onSuccess]
  );

  // ── Copy log ─────────────────────────────────────────────────────────────────

  function buildTranscript(): string {
    return entries
      .map((e) => {
        if (e.kind === "status") return `[PHASE: ${e.phase}] ${e.message}`;
        if (e.kind === "log")    return `[${e.stream.toUpperCase()}] ${e.line}`;
        if (e.kind === "error")  return `[ERROR] ${e.message}`;
        return "";
      })
      .join("\n");
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
    if (stage === "detecting") return; // non-dismissable while detection is in flight
    onClose();
  }

  // ── Signal card ───────────────────────────────────────────────────────────────

  function SignalCard({
    label,
    description,
    present,
  }: {
    label: string;
    description: string;
    present: boolean;
  }) {
    return (
      <div className="flex min-h-[64px] items-center gap-3 rounded-lg border border-slate-700/40 bg-obsidian-700/30 px-4 py-3">
        {present ? (
          // Check circle — neon-emerald
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 shrink-0 text-neon-emerald"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ) : (
          // Minus / dash — slate-500
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 shrink-0 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-200">{label}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  // Shared header used in confirm + review stages
  function ConfirmHeader() {
    return (
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neon-amber/10">
          {/* Download icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-neon-amber"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
    );
  }

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
            stage === "confirm" || stage === "detecting" || stage === "review"
              ? "max-w-lg"
              : "max-w-3xl"
          }`}
        >
          {/* ── Confirm Stage ─────────────────────────────────────────────── */}
          {stage === "confirm" && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-6"
            >
              <ConfirmHeader />

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

              {/* Notices */}
              <div className="mb-5 space-y-3">
                {/* Key-rotation warning — kept from original */}
                <div className="flex items-start gap-3 rounded-lg border border-neon-amber/20 bg-neon-amber/5 px-4 py-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mt-0.5 h-4 w-4 shrink-0 text-neon-amber"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-sm text-neon-amber/90">
                    This will rotate the agent API key on this server. Any existing agent on the
                    host will stop reporting until the new key is applied.
                  </p>
                </div>
                {/* Probe description — replaces the old docker notice */}
                <div className="flex items-start gap-3 rounded-lg border border-slate-700/40 bg-obsidian-700/30 px-4 py-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-sm text-slate-400">
                    We'll probe the host first to pick the safest install path.
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
                  onClick={detectStack}
                  className="rounded-lg border border-neon-amber/40 bg-neon-amber/15 px-5 py-2.5 text-sm font-semibold text-neon-amber shadow-lg shadow-neon-amber/10 transition-all hover:bg-neon-amber/25 hover:shadow-neon-amber/20"
                >
                  Install agent
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Detecting Stage ────────────────────────────────────────────── */}
          {stage === "detecting" && (
            <motion.div
              key="detecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-6"
            >
              <ConfirmHeader />

              <div className="flex flex-col items-center justify-center gap-3 py-8">
                {/* Spinner */}
                <svg
                  className="h-8 w-8 animate-spin text-neon-amber/70"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-200">Probing host stack...</p>
                  <p className="mt-1 text-xs text-slate-500">This usually takes ~5–8 seconds.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Review Stage ───────────────────────────────────────────────── */}
          {stage === "review" && detectResult && (
            <motion.div
              key="review"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-6"
            >
              <ConfirmHeader />

              {/* Signal cards — 2-column grid */}
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SignalCard
                  label="CyberPanel"
                  description="Control panel detected"
                  present={detectResult.profile.hasCyberPanel}
                />
                <SignalCard
                  label="Docker"
                  description="Docker CLI present"
                  present={detectResult.profile.hasDocker}
                />
                <SignalCard
                  label="BuildKit"
                  description="BuildKit / buildx available"
                  present={detectResult.profile.hasDockerBuildKit}
                />
                <SignalCard
                  label="systemd"
                  description="systemd init system"
                  present={detectResult.profile.hasSystemd}
                />
              </div>

              {/* Distro line */}
              <p className="mb-4 text-xs text-slate-400">
                Distro:{" "}
                <span className="font-mono text-slate-300">
                  {detectResult.profile.distro || "unknown"}
                </span>
              </p>

              {/* Recommended mode panel */}
              <div className="mb-4 rounded-lg border border-slate-700/40 bg-obsidian-700/30 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Recommended mode
                  </span>
                  <span className="inline-flex items-center rounded-full border border-neon-amber/30 bg-neon-amber/10 px-2.5 py-0.5 text-xs font-semibold text-neon-amber">
                    {modeLabel(detectResult.recommendedMode)}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {computeRationale(detectResult.profile)}
                </p>
              </div>

              {/* Override toggle */}
              <div className="mb-5">
                <p className="mb-2 text-xs font-medium text-slate-400">Override install mode</p>
                <div
                  role="radiogroup"
                  aria-label="Install mode"
                  className="flex gap-2"
                >
                  {(["agent", "agent_systemd"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={chosenMode === mode}
                      onClick={() => setChosenMode(mode)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-amber/50 ${
                        chosenMode === mode
                          ? "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
                          : "border-slate-700/50 bg-obsidian-800/60 text-slate-400 hover:border-slate-600/60 hover:text-slate-300"
                      }`}
                    >
                      {modeLabel(mode)}
                    </button>
                  ))}
                </div>

                {/* Override warning: agent selected but no BuildKit */}
                {chosenMode === "agent" && !detectResult.profile.hasDockerBuildKit && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-xs text-neon-amber/80"
                  >
                    Selected <span className="font-mono">agent</span> but BuildKit was not
                    detected. The Docker install may fail.
                  </motion.p>
                )}
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
                  onClick={() => {
                    if (chosenMode) startInstall(chosenMode);
                  }}
                  disabled={!chosenMode}
                  className="rounded-lg border border-neon-amber/40 bg-neon-amber/15 px-5 py-2.5 text-sm font-semibold text-neon-amber shadow-lg shadow-neon-amber/10 transition-all hover:bg-neon-amber/25 hover:shadow-neon-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm install
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Streaming / Finished Stage ────────────────────────────────── */}
          {(stage === "streaming" || stage === "finished") && (
            <div className="flex flex-col" style={{ minHeight: "420px", maxHeight: "90vh" }}>
              {/* Modal header */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-700/50 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Terminal icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700/40">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-slate-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white truncate">{serverName}</span>
                      {/* Phase badge */}
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          stage === "finished" && result?.ok
                            ? "border-neon-emerald/30 bg-neon-emerald/10 text-neon-emerald"
                            : stage === "finished" && !result?.ok
                            ? "border-neon-rose/30 bg-neon-rose/10 text-neon-rose"
                            : "border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan"
                        }`}
                      >
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
                  Agent reporting expected within ~30s. Watch{" "}
                  <span className="font-mono">lastSeenAt</span> on the server list.
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
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Connecting...
                  </div>
                )}

                {entries.map((entry, idx) => {
                  if (entry.kind === "status") {
                    return (
                      <div
                        key={idx}
                        className="mb-1 flex items-center gap-2 font-semibold text-neon-cyan"
                      >
                        {/* Chevron right */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
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
