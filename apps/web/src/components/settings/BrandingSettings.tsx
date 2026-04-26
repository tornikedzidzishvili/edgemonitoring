import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../../lib/api";

const TOKEN_KEY = "edge_monitoring_token";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type BrandingInfo = {
  platformName: string;
  hasLogo: boolean;
  hasFavicon: boolean;
  logoUrl: string | null;
  faviconUrl: string | null;
  updatedAt: string | null;
};

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const dangerBtnClasses =
  "rounded-lg border border-neon-rose/50 bg-neon-rose/10 px-4 py-2.5 text-sm font-medium text-neon-rose transition-all hover:bg-neon-rose/20 disabled:opacity-50 disabled:cursor-not-allowed";

const LOGO_MAX_BYTES = 512 * 1024; // 512 KB
const FAVICON_MAX_BYTES = 64 * 1024; // 64 KB

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SectionDivider() {
  return <div className="my-8 border-t border-slate-700/50" />;
}

type StatusBannerProps = {
  type: "error" | "success";
  message: string;
};

function StatusBanner({ type, message }: StatusBannerProps) {
  const isError = type === "error";
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={[
        "mt-4 rounded-lg border px-4 py-3 text-sm",
        isError
          ? "border-neon-rose/30 bg-neon-rose/10 text-neon-rose"
          : "border-neon-emerald/30 bg-neon-emerald/10 text-neon-emerald"
      ].join(" ")}
    >
      {message}
    </motion.div>
  );
}

type AssetStatus = { error: string; success: string; loading: boolean };

function emptyStatus(): AssetStatus {
  return { error: "", success: "", loading: false };
}

async function fetchBranding(): Promise<BrandingInfo> {
  const res = await fetch(`${API_BASE_URL}/settings/branding`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
  }
  return (await res.json()) as BrandingInfo;
}

export default function BrandingSettings() {
  const [branding, setBranding] = useState<BrandingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState("");

  // Platform name section
  const [platformName, setPlatformName] = useState("");
  const [nameStatus, setNameStatus] = useState<AssetStatus>(emptyStatus());

  // Logo section
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoSizeError, setLogoSizeError] = useState("");
  const [logoStatus, setLogoStatus] = useState<AssetStatus>(emptyStatus());
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Favicon section
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconSizeError, setFaviconSizeError] = useState("");
  const [faviconStatus, setFaviconStatus] = useState<AssetStatus>(emptyStatus());
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setLoading(true);
      setInitError("");
      const data = await fetchBranding();
      setBranding(data);
      setPlatformName(data.platformName || "");
    } catch (err) {
      setInitError(err instanceof Error ? err.message : "Failed to load branding settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ── Platform name save ──
  const handleSaveName = async () => {
    setNameStatus({ ...emptyStatus(), loading: true });
    try {
      const fd = new FormData();
      fd.append("platformName", platformName.trim());
      const res = await fetch(`${API_BASE_URL}/settings/branding`, {
        method: "PUT",
        headers: authHeaders(),
        body: fd
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; branding: BrandingInfo };
      setBranding(json.branding);
      setPlatformName(json.branding.platformName || "");
      setNameStatus({ error: "", success: "Platform name updated", loading: false });
    } catch (err) {
      setNameStatus({ error: err instanceof Error ? err.message : "Failed to update platform name", success: "", loading: false });
    }
  };

  // ── Logo upload ──
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    setLogoSizeError("");
    if (file && file.size > LOGO_MAX_BYTES) {
      setLogoSizeError(`File exceeds 512 KB limit (${(file.size / 1024).toFixed(0)} KB)`);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile || logoFile.size > LOGO_MAX_BYTES) return;
    setLogoStatus({ ...emptyStatus(), loading: true });
    try {
      const fd = new FormData();
      fd.append("logo", logoFile);
      const res = await fetch(`${API_BASE_URL}/settings/branding`, {
        method: "PUT",
        headers: authHeaders(),
        body: fd
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; branding: BrandingInfo };
      setBranding(json.branding);
      setLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      setLogoStatus({ error: "", success: "Logo updated", loading: false });
    } catch (err) {
      setLogoStatus({ error: err instanceof Error ? err.message : "Failed to upload logo", success: "", loading: false });
    }
  };

  const handleRemoveLogo = async () => {
    setLogoStatus({ ...emptyStatus(), loading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/settings/branding/logo`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
      }
      const fresh = await fetchBranding();
      setBranding(fresh);
      setLogoStatus({ error: "", success: "Logo removed", loading: false });
    } catch (err) {
      setLogoStatus({ error: err instanceof Error ? err.message : "Failed to remove logo", success: "", loading: false });
    }
  };

  // ── Favicon upload ──
  const handleFaviconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFaviconFile(file);
    setFaviconSizeError("");
    if (file && file.size > FAVICON_MAX_BYTES) {
      setFaviconSizeError(`File exceeds 64 KB limit (${(file.size / 1024).toFixed(0)} KB)`);
    }
  };

  const handleUploadFavicon = async () => {
    if (!faviconFile || faviconFile.size > FAVICON_MAX_BYTES) return;
    setFaviconStatus({ ...emptyStatus(), loading: true });
    try {
      const fd = new FormData();
      fd.append("favicon", faviconFile);
      const res = await fetch(`${API_BASE_URL}/settings/branding`, {
        method: "PUT",
        headers: authHeaders(),
        body: fd
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; branding: BrandingInfo };
      setBranding(json.branding);
      setFaviconFile(null);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
      setFaviconStatus({ error: "", success: "Favicon updated", loading: false });
    } catch (err) {
      setFaviconStatus({ error: err instanceof Error ? err.message : "Failed to upload favicon", success: "", loading: false });
    }
  };

  const handleRemoveFavicon = async () => {
    setFaviconStatus({ ...emptyStatus(), loading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/settings/branding/favicon`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
      }
      const fresh = await fetchBranding();
      setBranding(fresh);
      setFaviconStatus({ error: "", success: "Favicon removed", loading: false });
    } catch (err) {
      setFaviconStatus({ error: err instanceof Error ? err.message : "Failed to remove favicon", success: "", loading: false });
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading branding settings...
      </div>
    );
  }

  // ── Init error ──
  if (initError) {
    return (
      <div className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose">
        {initError}{" "}
        <button
          type="button"
          onClick={load}
          className="ml-2 underline underline-offset-2 hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const cacheBust = branding?.updatedAt ? `?t=${new Date(branding.updatedAt).getTime()}` : "";

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Branding</h2>
          <p className="mt-1 text-sm text-slate-400">
            Customize the platform name, logo, and favicon displayed to all users.
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          Section 1: Platform Name
      ════════════════════════════════════════════ */}
      <SectionDivider />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Platform Name
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Shown in the browser tab title and UI headers. Maximum 64 characters.
        </p>

        <AnimatePresence mode="wait">
          {nameStatus.error && <StatusBanner key="name-err" type="error" message={nameStatus.error} />}
          {nameStatus.success && <StatusBanner key="name-ok" type="success" message={nameStatus.success} />}
        </AnimatePresence>

        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="platformName" className={labelClasses}>
              Platform name
            </label>
            <input
              id="platformName"
              type="text"
              value={platformName}
              maxLength={64}
              onChange={(e) => {
                setPlatformName(e.target.value);
                if (nameStatus.success) setNameStatus(emptyStatus());
              }}
              placeholder="Edge Monitoring"
              className={inputClasses}
            />
          </div>
          <button
            type="button"
            onClick={handleSaveName}
            disabled={nameStatus.loading || !platformName.trim()}
            className={primaryBtnClasses}
          >
            {nameStatus.loading ? (
              <span className="flex items-center gap-2">
                <SpinnerIcon />
                Saving...
              </span>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          Section 2: Logo
      ════════════════════════════════════════════ */}
      <SectionDivider />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Logo
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Displayed in the sidebar and navigation. PNG or SVG recommended. Max 512 KB.
        </p>

        <AnimatePresence mode="wait">
          {logoStatus.error && <StatusBanner key="logo-err" type="error" message={logoStatus.error} />}
          {logoStatus.success && <StatusBanner key="logo-ok" type="success" message={logoStatus.success} />}
        </AnimatePresence>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Preview / empty state */}
          <div className="flex shrink-0 items-center justify-center rounded-xl border border-slate-700/50 bg-obsidian-800/60 p-4"
            style={{ width: 160, minHeight: 96 }}>
            {branding?.hasLogo && branding.logoUrl ? (
              <img
                src={`${branding.logoUrl}${cacheBust}`}
                alt="Platform logo"
                className="max-h-16 max-w-full rounded object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-slate-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <span className="text-xs text-slate-600">No logo uploaded</span>
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div className="flex flex-1 flex-col gap-3">
            <div>
              <label htmlFor="logoFile" className={labelClasses}>
                Upload new logo
              </label>
              <input
                id="logoFile"
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                className="block w-full cursor-pointer rounded-lg border border-slate-700/50 bg-obsidian-800 px-3 py-2 text-sm text-slate-300 transition-all file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-700/60 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-200 file:transition-colors file:hover:bg-slate-600/60 focus:border-neon-cyan/50 focus:outline-none"
              />
              <AnimatePresence>
                {logoSizeError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1.5 text-xs text-neon-rose"
                  >
                    {logoSizeError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUploadLogo}
                disabled={!logoFile || !!logoSizeError || logoStatus.loading}
                className={primaryBtnClasses}
              >
                {logoStatus.loading && !branding?.hasLogo ? (
                  <span className="flex items-center gap-2">
                    <SpinnerIcon />
                    Uploading...
                  </span>
                ) : (
                  "Upload"
                )}
              </button>

              {branding?.hasLogo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={logoStatus.loading}
                  className={dangerBtnClasses}
                >
                  {logoStatus.loading ? (
                    <span className="flex items-center gap-2">
                      <SpinnerIcon />
                      Removing...
                    </span>
                  ) : (
                    "Remove logo"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          Section 3: Favicon
      ════════════════════════════════════════════ */}
      <SectionDivider />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Favicon
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Shown in the browser tab. PNG, ICO, or SVG. Max 64 KB. Recommended size: 32×32 or 64×64 px.
        </p>

        <AnimatePresence mode="wait">
          {faviconStatus.error && <StatusBanner key="fav-err" type="error" message={faviconStatus.error} />}
          {faviconStatus.success && <StatusBanner key="fav-ok" type="success" message={faviconStatus.success} />}
        </AnimatePresence>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Preview / empty state */}
          <div
            className="flex shrink-0 items-center justify-center rounded-xl border border-slate-700/50 bg-obsidian-800/60 p-4"
            style={{ width: 96, minHeight: 96 }}
          >
            {branding?.hasFavicon && branding.faviconUrl ? (
              <img
                src={`${branding.faviconUrl}${cacheBust}`}
                alt="Favicon"
                className="h-10 w-10 rounded object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-slate-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                <span className="text-xs text-slate-600">No favicon</span>
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div className="flex flex-1 flex-col gap-3">
            <div>
              <label htmlFor="faviconFile" className={labelClasses}>
                Upload new favicon
              </label>
              <input
                id="faviconFile"
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/x-icon,image/svg+xml"
                onChange={handleFaviconFileChange}
                className="block w-full cursor-pointer rounded-lg border border-slate-700/50 bg-obsidian-800 px-3 py-2 text-sm text-slate-300 transition-all file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-700/60 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-200 file:transition-colors file:hover:bg-slate-600/60 focus:border-neon-cyan/50 focus:outline-none"
              />
              <AnimatePresence>
                {faviconSizeError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1.5 text-xs text-neon-rose"
                  >
                    {faviconSizeError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUploadFavicon}
                disabled={!faviconFile || !!faviconSizeError || faviconStatus.loading}
                className={primaryBtnClasses}
              >
                {faviconStatus.loading && !branding?.hasFavicon ? (
                  <span className="flex items-center gap-2">
                    <SpinnerIcon />
                    Uploading...
                  </span>
                ) : (
                  "Upload"
                )}
              </button>

              {branding?.hasFavicon && (
                <button
                  type="button"
                  onClick={handleRemoveFavicon}
                  disabled={faviconStatus.loading}
                  className={dangerBtnClasses}
                >
                  {faviconStatus.loading ? (
                    <span className="flex items-center gap-2">
                      <SpinnerIcon />
                      Removing...
                    </span>
                  ) : (
                    "Remove favicon"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
