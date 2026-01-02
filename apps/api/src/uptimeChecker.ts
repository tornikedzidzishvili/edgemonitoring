import { request } from "undici";

export type CheckResult = {
  ok: boolean;
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string;
};

export async function checkUrl(url: string, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now();
  try {
    // Prefer HEAD but some apps block it; fall back to GET.
    const head = await tryRequest("HEAD", url, timeoutMs);
    if (head.ok) {
      return { ok: true, httpStatus: head.statusCode, responseTimeMs: Date.now() - started };
    }

    const get = await tryRequest("GET", url, timeoutMs);
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
    return { ok: false, responseTimeMs: Date.now() - started, error: err instanceof Error ? err.message : "unknown" };
  }
}

async function tryRequest(
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
    // Drain body for GET to avoid socket reuse issues.
    if (method === "GET") {
      try {
        await res.body.text();
      } catch {
        // ignore
      }
    }
    const ok = res.statusCode >= 200 && res.statusCode < 400;
    return { ok, statusCode: res.statusCode, error: ok ? undefined : `http-${res.statusCode}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
