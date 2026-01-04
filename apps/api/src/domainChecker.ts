import { request } from "undici";
import * as tls from "node:tls";
import * as dns from "node:dns/promises";

export type HttpCheckResult = {
  ok: boolean;
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string;
};

export type DnsCheckResult = {
  ip: string | null;
  error?: string;
};

export type SslCheckResult = {
  valid: boolean;
  expiresAt: Date | null;
  issuer: string | null;
  error?: string;
};

export async function checkDomainHttp(domain: string, timeoutMs: number): Promise<HttpCheckResult> {
  const started = Date.now();
  const url = `https://${domain}`;

  try {
    // Try HEAD first
    const head = await tryHttpRequest("HEAD", url, timeoutMs);
    if (head.ok) {
      return { ok: true, httpStatus: head.statusCode, responseTimeMs: Date.now() - started };
    }

    // Fall back to GET
    const get = await tryHttpRequest("GET", url, timeoutMs);
    if (get.ok) {
      return { ok: true, httpStatus: get.statusCode, responseTimeMs: Date.now() - started };
    }

    return {
      ok: false,
      httpStatus: get.statusCode ?? head.statusCode,
      responseTimeMs: Date.now() - started,
      error: get.error ?? head.error ?? "request-failed"
    };
  } catch (err) {
    return {
      ok: false,
      responseTimeMs: Date.now() - started,
      error: err instanceof Error ? err.message : "unknown"
    };
  }
}

async function tryHttpRequest(
  method: "HEAD" | "GET",
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  try {
    const res = await request(url, {
      method,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs
    });
    if (method === "GET") {
      try {
        await res.body.text();
      } catch {
        // ignore body drain errors
      }
    }
    const ok = res.statusCode >= 200 && res.statusCode < 400;
    return { ok, statusCode: res.statusCode, error: ok ? undefined : `http-${res.statusCode}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function checkDomainDns(domain: string): Promise<DnsCheckResult> {
  try {
    const addresses = await dns.resolve4(domain);
    return { ip: addresses[0] ?? null };
  } catch (err) {
    return { ip: null, error: err instanceof Error ? err.message : "dns-lookup-failed" };
  }
}

export async function checkSslCertificate(domain: string, timeoutMs = 10000): Promise<SslCheckResult> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false // We want to check even expired certs
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            socket.destroy();
            resolve({ valid: false, expiresAt: null, issuer: null, error: "no-certificate" });
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const issuer = cert.issuer?.O || cert.issuer?.CN || null;
          const now = new Date();
          const valid = expiresAt > now;

          socket.destroy();
          resolve({ valid, expiresAt, issuer });
        } catch (err) {
          socket.destroy();
          resolve({
            valid: false,
            expiresAt: null,
            issuer: null,
            error: err instanceof Error ? err.message : "cert-parse-error"
          });
        }
      }
    );

    socket.on("error", (err) => {
      socket.destroy();
      resolve({
        valid: false,
        expiresAt: null,
        issuer: null,
        error: err.message || "connection-error"
      });
    });

    // Timeout handling
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        valid: false,
        expiresAt: null,
        issuer: null,
        error: "timeout"
      });
    }, timeoutMs);

    socket.on("close", () => {
      clearTimeout(timer);
    });
  });
}

export function getSslStatus(expiresAt: Date | null): "valid" | "warning" | "critical" | "unknown" {
  if (!expiresAt) return "unknown";
  const daysUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return "critical";
  if (daysUntilExpiry < 7) return "critical";
  if (daysUntilExpiry < 30) return "warning";
  return "valid";
}
