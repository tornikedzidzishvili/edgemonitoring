/**
 * Branding routes — logo and favicon upload/serve for platform white-labelling.
 *
 * Security notes:
 *  - Files are stored at hardcoded paths only; user-supplied filenames are never
 *    used, eliminating path-traversal risk.
 *  - Magic-bytes detection is used instead of trusting Content-Type headers or
 *    file extensions, because a compromised client could supply false metadata.
 *  - Atomic writes (tmp → rename) prevent serving a partial file during upload.
 *  - Size limits are enforced at both the multipart-parse layer (fileSize) and
 *    re-checked in the handler to defend against race conditions.
 *  - Public read endpoints are stream-based (createReadStream) to avoid loading
 *    large images into memory with readFileSync.
 */

import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createReadStream, promises as fs } from "node:fs";
import { requireAdmin } from "../middleware/sessionAuth.js";
import { prisma } from "../db.js";
import { getEnv } from "../env.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRANDING_DIR = "/data/branding";

/** Maximum bytes allowed for a logo upload (512 KB). */
const LOGO_MAX_BYTES = 512 * 1024;

/** Maximum bytes allowed for a favicon upload (64 KB). */
const FAVICON_MAX_BYTES = 64 * 1024;

/** Bytes needed to read for magic-bytes detection. */
const MAGIC_PEEK = 12;

// ---------------------------------------------------------------------------
// Magic-bytes detection
// ---------------------------------------------------------------------------

type DetectedMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" | "image/x-icon";

/**
 * Inspect the leading bytes of an upload buffer and return the detected MIME
 * type, or null if the bytes do not match any supported format.
 *
 * Do NOT trust the browser-supplied mimetype — a compromised client (or a
 * malicious server reporting metrics) can set Content-Type to anything.
 */
function detectMime(buf: Buffer): DetectedMime | null {
  if (buf.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF (any 4th byte)
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50    // P
  ) {
    return "image/webp";
  }

  // ICO: 00 00 01 00
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return "image/x-icon";
  }

  // SVG: XML or direct SVG tag (UTF-8 text)
  const prefix = buf.toString("utf8", 0, Math.min(buf.length, MAGIC_PEEK));
  if (prefix.trimStart().startsWith("<?xml") || prefix.trimStart().startsWith("<svg")) {
    return "image/svg+xml";
  }

  return null;
}

/** Map a detected MIME to the file extension used in the storage path. */
function mimeToExt(mime: DetectedMime): string {
  switch (mime) {
    case "image/png":       return "png";
    case "image/jpeg":      return "jpg";
    case "image/webp":      return "webp";
    case "image/svg+xml":   return "svg";
    case "image/x-icon":    return "ico";
  }
}

// ---------------------------------------------------------------------------
// Allowed MIME sets per asset type
// ---------------------------------------------------------------------------

const LOGO_ALLOWED: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml"
]);

const FAVICON_ALLOWED: ReadonlySet<string> = new Set([
  "image/png",
  "image/x-icon",
  "image/svg+xml"
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read exactly `n` bytes from a multipart file stream.
 * Returns a buffer of however many bytes were available (may be < n at EOF).
 * The stream is NOT consumed — it is read lazily through the standard interface.
 */
async function peekBuffer(stream: NodeJS.ReadableStream, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= n) {
        stream.removeListener("data", onData);
        stream.removeListener("error", onError);
        stream.removeListener("end", onEnd);
        // Re-emit buffered data so downstream can still read the full file.
        // We do this by unshifting back into the stream if it supports it;
        // otherwise callers must use concat + process the full buffer.
        resolve(Buffer.concat(chunks));
      }
    };

    const onEnd = () => resolve(Buffer.concat(chunks));
    const onError = (err: Error) => reject(err);

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}

/**
 * Drain a readable stream into a single Buffer, enforcing a maximum byte limit.
 * Throws with code "FILE_TOO_LARGE" if the limit is exceeded.
 */
async function drainWithLimit(stream: NodeJS.ReadableStream, maxBytes: number, initialChunks: Buffer[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [...initialChunks];
    let total = initialChunks.reduce((acc, b) => acc + b.length, 0);

    if (total > maxBytes) {
      reject(Object.assign(new Error("file-too-large"), { code: "FILE_TOO_LARGE" }));
      return;
    }

    stream.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        stream.removeAllListeners();
        reject(Object.assign(new Error("file-too-large"), { code: "FILE_TOO_LARGE" }));
        return;
      }
      chunks.push(buf);
    });

    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", (err) => reject(err));
  });
}

/** Build the BrandingPayload shape returned by GET /settings/branding. */
function buildPayload(
  row: { platformName: string; logoPath: string | null; logoMimeType: string | null; faviconPath: string | null; faviconMime: string | null; updatedAt: Date } | null,
  publicApiUrl: string
) {
  const platformName = row?.platformName ?? "Edge Monitor";
  const hasLogo = !!row?.logoPath;
  const hasFavicon = !!row?.faviconPath;
  return {
    platformName,
    hasLogo,
    hasFavicon,
    logoUrl:    hasLogo    ? `${publicApiUrl}/branding/logo`    : null,
    faviconUrl: hasFavicon ? `${publicApiUrl}/branding/favicon` : null,
    updatedAt:  row ? row.updatedAt.toISOString() : new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Defense-in-depth: ensure the branding directory exists at startup
// ---------------------------------------------------------------------------

/**
 * Ensure /data/branding exists and is writable. Called once during boot.
 * Logs a warning but does NOT crash if the probe fails — the directory is
 * created by Docker Compose in production but may be absent in unit-test
 * environments that don't mount the volume.
 */
export async function ensureBrandingDir(): Promise<void> {
  try {
    await fs.mkdir(BRANDING_DIR, { recursive: true });
    // Write-probe: create and remove a small canary file
    const probe = `${BRANDING_DIR}/.write-probe`;
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
  } catch (err) {
    // Log but do not throw — fail-open at startup; actual upload attempts will
    // surface the error at request time with a proper 500.
    console.warn("[branding] ensureBrandingDir probe failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function brandingRoutes(app: FastifyInstance): Promise<void> {
  const env = getEnv();

  // Register multipart support scoped to this plugin context.
  // limits.fileSize is set to the larger of the two (logo 512 KB) as a safety
  // net; individual handlers also enforce per-field limits via drainWithLimit.
  await app.register(multipart, {
    limits: {
      fileSize: LOGO_MAX_BYTES,
      files: 2,     // logo + favicon at most
      fields: 1     // platformName
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /settings/branding — upload logo and/or favicon, or update platformName
  // ---------------------------------------------------------------------------
  app.put("/settings/branding", { preHandler: requireAdmin }, async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.status(400).send({ error: "invalid-content-type", message: "Request must be multipart/form-data" });
    }

    let platformName: string | undefined;
    let logoBuffer: Buffer | undefined;
    let logoMime: DetectedMime | undefined;
    let faviconBuffer: Buffer | undefined;
    let faviconMime: DetectedMime | undefined;

    // Iterate all parts (fields + files) in one pass.
    for await (const part of req.parts()) {
      if (part.type === "field") {
        if (part.fieldname === "platformName") {
          const val = String(part.value ?? "").trim();
          if (val.length > 0 && val.length <= 64) {
            platformName = val;
          } else if (val.length > 64) {
            return reply.status(422).send({ error: "validation-error", message: "platformName must be at most 64 characters" });
          }
        }
        continue;
      }

      // type === "file"
      if (part.fieldname === "logo") {
        const maxBytes = LOGO_MAX_BYTES;

        // Read the full file contents (stream is single-use; must drain to avoid hanging)
        let buf: Buffer;
        try {
          buf = await drainWithLimit(part.file, maxBytes);
        } catch (err: unknown) {
          const e = err as NodeJS.ErrnoException;
          if (e?.code === "FILE_TOO_LARGE" || (app.multipartErrors && part.file.truncated)) {
            return reply.status(413).send({ error: "file-too-large", message: `Logo must be at most ${maxBytes / 1024} KB` });
          }
          throw err;
        }

        if (part.file.truncated) {
          return reply.status(413).send({ error: "file-too-large", message: `Logo must be at most ${maxBytes / 1024} KB` });
        }

        const detected = detectMime(buf);
        if (!detected || !LOGO_ALLOWED.has(detected)) {
          return reply.status(422).send({
            error: "invalid-file-type",
            message: `Logo must be PNG, JPEG, WebP, or SVG. Detected: ${detected ?? "unknown"}`
          });
        }

        logoBuffer = buf;
        logoMime = detected;
        continue;
      }

      if (part.fieldname === "favicon") {
        const maxBytes = FAVICON_MAX_BYTES;

        let buf: Buffer;
        try {
          buf = await drainWithLimit(part.file, maxBytes);
        } catch (err: unknown) {
          const e = err as NodeJS.ErrnoException;
          if (e?.code === "FILE_TOO_LARGE" || part.file.truncated) {
            return reply.status(413).send({ error: "file-too-large", message: `Favicon must be at most ${maxBytes / 1024} KB` });
          }
          throw err;
        }

        if (part.file.truncated) {
          return reply.status(413).send({ error: "file-too-large", message: `Favicon must be at most ${maxBytes / 1024} KB` });
        }

        const detected = detectMime(buf);
        if (!detected || !FAVICON_ALLOWED.has(detected)) {
          return reply.status(422).send({
            error: "invalid-file-type",
            message: `Favicon must be PNG, ICO, or SVG. Detected: ${detected ?? "unknown"}`
          });
        }

        faviconBuffer = buf;
        faviconMime = detected;
        continue;
      }

      // Unknown file field — drain and discard to avoid connection hang
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of part.file) { /* drain */ }
    }

    const hasAnyChange = platformName !== undefined || logoBuffer !== undefined || faviconBuffer !== undefined;
    if (!hasAnyChange) {
      return reply.status(400).send({ error: "no-change", message: "Provide at least one of: platformName, logo, favicon" });
    }

    // --- Retrieve current row before writing files (needed for old-ext cleanup) ---
    const existing = await prisma.brandingSettings.findFirst();

    // --- Atomic file writes ---
    const dbUpdate: {
      platformName?: string;
      logoPath?: string;
      logoMimeType?: string;
      faviconPath?: string;
      faviconMime?: string;
    } = {};

    if (logoBuffer && logoMime) {
      const ext = mimeToExt(logoMime);
      const finalPath = `${BRANDING_DIR}/logo.${ext}`;
      const tmpPath = `${BRANDING_DIR}/.logo.${ext}.tmp`;

      // Remove stale file at the old extension before renaming the new one in.
      // This prevents leftover files when the format changes (e.g. PNG → WebP).
      if (existing?.logoPath && existing.logoPath !== finalPath) {
        await fs.unlink(existing.logoPath).catch(() => {
          // Best-effort; file may already be gone
        });
      }

      await fs.writeFile(tmpPath, logoBuffer);
      await fs.rename(tmpPath, finalPath);

      dbUpdate.logoPath = finalPath;
      dbUpdate.logoMimeType = logoMime;
    }

    if (faviconBuffer && faviconMime) {
      const ext = mimeToExt(faviconMime);
      const finalPath = `${BRANDING_DIR}/favicon.${ext}`;
      const tmpPath = `${BRANDING_DIR}/.favicon.${ext}.tmp`;

      if (existing?.faviconPath && existing.faviconPath !== finalPath) {
        await fs.unlink(existing.faviconPath).catch(() => {
          // Best-effort
        });
      }

      await fs.writeFile(tmpPath, faviconBuffer);
      await fs.rename(tmpPath, finalPath);

      dbUpdate.faviconPath = finalPath;
      dbUpdate.faviconMime = faviconMime;
    }

    if (platformName !== undefined) {
      dbUpdate.platformName = platformName;
    }

    // Upsert — avoids a race on the very first write where two concurrent
    // requests would both try to INSERT and one would fail a uniqueness check.
    const row = await prisma.brandingSettings.upsert({
      where: { id: existing?.id ?? "" },
      create: {
        platformName: dbUpdate.platformName ?? "Edge Monitor",
        logoPath:     dbUpdate.logoPath ?? null,
        logoMimeType: dbUpdate.logoMimeType ?? null,
        faviconPath:  dbUpdate.faviconPath ?? null,
        faviconMime:  dbUpdate.faviconMime ?? null
      },
      update: dbUpdate
    });

    return { ok: true, branding: buildPayload(row, env.PUBLIC_API_URL) };
  });

  // ---------------------------------------------------------------------------
  // GET /branding — public, no auth required
  //
  // Returns the same BrandingPayload shape as /settings/branding but is
  // accessible without a session. Safe to expose because BrandingPayload
  // contains no secrets — only display metadata (platform name, image URLs,
  // timestamps). The image binaries themselves are already public via
  // /branding/logo and /branding/favicon.
  //
  // The route guard's isPublicRoute() is also updated to exact-match "/branding"
  // so this endpoint is reachable before any session check fires.
  // ---------------------------------------------------------------------------
  app.get("/branding", async () => {
    const row = await prisma.brandingSettings.findFirst();
    return buildPayload(row, env.PUBLIC_API_URL);
  });

  // ---------------------------------------------------------------------------
  // GET /settings/branding — return current branding metadata (no files)
  // ---------------------------------------------------------------------------
  app.get("/settings/branding", { preHandler: requireAdmin }, async () => {
    const row = await prisma.brandingSettings.findFirst();
    return buildPayload(row, env.PUBLIC_API_URL);
  });

  // ---------------------------------------------------------------------------
  // DELETE /settings/branding/logo
  // ---------------------------------------------------------------------------
  app.delete("/settings/branding/logo", { preHandler: requireAdmin }, async () => {
    const row = await prisma.brandingSettings.findFirst();
    if (row?.logoPath) {
      await fs.unlink(row.logoPath).catch((err) => {
        // Best-effort: file may have already been removed manually.
        app.log.warn({ err, path: row.logoPath }, "branding: could not unlink logo file");
      });
      await prisma.brandingSettings.update({
        where: { id: row.id },
        data: { logoPath: null, logoMimeType: null }
      });
    }
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // DELETE /settings/branding/favicon
  // ---------------------------------------------------------------------------
  app.delete("/settings/branding/favicon", { preHandler: requireAdmin }, async () => {
    const row = await prisma.brandingSettings.findFirst();
    if (row?.faviconPath) {
      await fs.unlink(row.faviconPath).catch((err) => {
        app.log.warn({ err, path: row.faviconPath }, "branding: could not unlink favicon file");
      });
      await prisma.brandingSettings.update({
        where: { id: row.id },
        data: { faviconPath: null, faviconMime: null }
      });
    }
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // GET /branding/logo — public, no auth
  // ---------------------------------------------------------------------------
  app.get("/branding/logo", async (_req, reply) => {
    const row = await prisma.brandingSettings.findFirst();
    if (!row?.logoPath || !row.logoMimeType) {
      return reply.status(404).send({ error: "not-found", message: "No logo has been uploaded" });
    }

    // Verify the file exists before opening a stream (avoids an unhandled
    // ENOENT bubbling up as a 500 — the DB row may reference a deleted file).
    try {
      await fs.access(row.logoPath);
    } catch {
      return reply.status(404).send({ error: "not-found", message: "Logo file not found on disk" });
    }

    const etag = `"${row.updatedAt.getTime()}"`;

    reply.header("Content-Type", row.logoMimeType);
    reply.header("Cache-Control", "public, max-age=3600");
    reply.header("ETag", etag);

    return reply.send(createReadStream(row.logoPath));
  });

  // ---------------------------------------------------------------------------
  // GET /branding/favicon — public, no auth
  // ---------------------------------------------------------------------------
  app.get("/branding/favicon", async (_req, reply) => {
    const row = await prisma.brandingSettings.findFirst();
    if (!row?.faviconPath || !row.faviconMime) {
      return reply.status(404).send({ error: "not-found", message: "No favicon has been uploaded" });
    }

    try {
      await fs.access(row.faviconPath);
    } catch {
      return reply.status(404).send({ error: "not-found", message: "Favicon file not found on disk" });
    }

    const etag = `"${row.updatedAt.getTime()}"`;

    reply.header("Content-Type", row.faviconMime);
    reply.header("Cache-Control", "public, max-age=3600");
    reply.header("ETag", etag);

    return reply.send(createReadStream(row.faviconPath));
  });
}
