/**
 * PWA manifest route — GET /manifest.webmanifest
 *
 * Returns a dynamically generated Web App Manifest reflecting the current
 * BrandingSettings (platformName, favicon). This route is intentionally
 * public (no auth) so that browsers and PWA install prompts can fetch it
 * without a session cookie.
 *
 * Security notes:
 *  - No user-supplied data is written to disk here; this is a pure read path.
 *  - platformName is fetched from DB and embedded as a JSON string value —
 *    JSON.stringify in reply.send() handles any escaping automatically.
 *  - Cache-Control is deliberately set to no-cache: installed PWAs must pick
 *    up branding changes quickly; the manifest is cheap to generate.
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getEnv } from "../env.js";

// Default platform name when no BrandingSettings row exists yet.
const DEFAULT_PLATFORM_NAME = "Edge Monitor";

// Characters allowed for short_name truncation (12 is the safe limit for
// Android home screen labels before the OS clips with an ellipsis).
const SHORT_NAME_MAX = 12;

export async function manifestRoutes(app: FastifyInstance): Promise<void> {
  const env = getEnv();

  app.get("/manifest.webmanifest", async (_req, reply) => {
    // Fetch singleton branding row — may be null if no branding has been set.
    const branding = await prisma.brandingSettings.findFirst();

    const platformName = branding?.platformName ?? DEFAULT_PLATFORM_NAME;
    const shortName = platformName.slice(0, SHORT_NAME_MAX);
    const faviconUrl = `${env.PUBLIC_API_URL}/branding/favicon`;
    const faviconMime = branding?.faviconMime ?? null;
    const hasFavicon = !!branding?.faviconPath;

    // Build the icons array.
    // - No favicon uploaded → empty array (valid manifest, avoids broken refs).
    // - SVG favicon → single entry with sizes "any" (SVG scales to all sizes).
    // - Raster favicon → two entries (192 and 512) with the same URL; browsers
    //   pick what they need.
    let icons: Array<{
      src: string;
      sizes: string;
      type: string;
      purpose: string;
    }>;

    if (!hasFavicon || !faviconMime) {
      icons = [];
    } else if (faviconMime === "image/svg+xml") {
      icons = [
        {
          src: faviconUrl,
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any"
        }
      ];
    } else {
      icons = [
        {
          src: faviconUrl,
          sizes: "192x192",
          type: faviconMime,
          purpose: "any"
        },
        {
          src: faviconUrl,
          sizes: "512x512",
          type: faviconMime,
          purpose: "any"
        }
      ];
    }

    const manifest = {
      name: platformName,
      short_name: shortName,
      start_url: "/",
      display: "standalone",
      background_color: "#030712",
      theme_color: "#030712",
      icons
    };

    // Content-Type: application/manifest+json per W3C spec.
    // Cache-Control: no-cache so installed PWAs pick up name/icon changes
    // without waiting for a stale cache to expire.
    reply
      .header("Content-Type", "application/manifest+json")
      .header("Cache-Control", "no-cache");

    return manifest;
  });
}
