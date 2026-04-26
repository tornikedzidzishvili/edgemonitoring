import { useState, useEffect, useCallback } from "react";
import { api, type BrandingInfo } from "../lib/api";
import { API_BASE_URL } from "../lib/api";

export type BrandingState = {
  platformName: string;
  hasLogo: boolean;
  hasFavicon: boolean;
  logoUrl: string | null;
  faviconUrl: string | null;
  refresh: () => Promise<void>;
};

const DEFAULT_PLATFORM_NAME = "Edge Monitor";

// Module-level cache so all components share a single fetch
let cachedBranding: BrandingInfo | null = null;
let fetchPromise: Promise<BrandingInfo> | null = null;

function buildLogoUrl(info: BrandingInfo): string | null {
  if (!info.hasLogo) return null;
  const t = info.updatedAt ? new Date(info.updatedAt).getTime() : Date.now();
  return `${API_BASE_URL}/branding/logo?t=${t}`;
}

function buildFaviconUrl(info: BrandingInfo): string | null {
  if (!info.hasFavicon) return null;
  const t = info.updatedAt ? new Date(info.updatedAt).getTime() : Date.now();
  return `${API_BASE_URL}/branding/favicon?t=${t}`;
}

async function fetchBranding(): Promise<BrandingInfo> {
  if (!fetchPromise) {
    fetchPromise = api.brandingSettings().catch(() => {
      // Return safe defaults if the fetch fails (e.g. network error)
      return {
        platformName: DEFAULT_PLATFORM_NAME,
        hasLogo: false,
        hasFavicon: false,
        logoUrl: null,
        faviconUrl: null,
        updatedAt: null
      } satisfies BrandingInfo;
    }).finally(() => {
      fetchPromise = null;
    });
  }
  return fetchPromise;
}

export function useBranding(): BrandingState {
  const [branding, setBranding] = useState<BrandingInfo | null>(cachedBranding);

  const load = useCallback(async () => {
    const result = await fetchBranding();
    cachedBranding = result;
    setBranding(result);
  }, []);

  useEffect(() => {
    // If already cached from a previous mount, use it immediately
    if (cachedBranding) {
      setBranding(cachedBranding);
      return;
    }
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    // Bust the module cache and re-fetch
    cachedBranding = null;
    fetchPromise = null;
    await load();
  }, [load]);

  const info = branding ?? {
    platformName: DEFAULT_PLATFORM_NAME,
    hasLogo: false,
    hasFavicon: false,
    logoUrl: null,
    faviconUrl: null,
    updatedAt: null
  };

  return {
    platformName: info.platformName || DEFAULT_PLATFORM_NAME,
    hasLogo: info.hasLogo,
    hasFavicon: info.hasFavicon,
    logoUrl: buildLogoUrl(info),
    faviconUrl: buildFaviconUrl(info),
    refresh
  };
}
