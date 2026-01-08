export function formatPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

export function formatMs(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v)} ms`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function formatFailureError(raw: string | null | undefined): string {
  if (!raw) return "—";

  const msg = raw.trim();

  // DNS lookup failures (Node.js: getaddrinfo ENOTFOUND host)
  const enotfound = msg.match(/\bENOTFOUND\b\s+([^\s]+)/i);
  if (enotfound?.[1]) {
    return `DNS lookup failed for ${enotfound[1]}`;
  }

  // DNS temporary failure (Node.js: getaddrinfo EAI_AGAIN host)
  const eaiAgain = msg.match(/\bEAI_AGAIN\b\s+([^\s]+)/i);
  if (eaiAgain?.[1]) {
    return `DNS temporarily unavailable for ${eaiAgain[1]}`;
  }
  if (/\bEAI_AGAIN\b/i.test(msg)) {
    return "DNS temporarily unavailable";
  }

  // Connection refused (service not listening / firewall)
  if (/\bECONNREFUSED\b/i.test(msg)) {
    return "Connection was refused (service may be down or blocked)";
  }

  // Network unreachable / host unreachable
  if (/\bENETUNREACH\b/i.test(msg)) {
    return "Network is unreachable";
  }
  if (/\bEHOSTUNREACH\b/i.test(msg)) {
    return "Host is unreachable";
  }

  // Aborted
  if (/\bECONNABORTED\b/i.test(msg)) {
    return "Connection was aborted";
  }

  // Timeouts
  if (/\bETIMEDOUT\b/i.test(msg) || /timeout/i.test(msg)) {
    return "Request timed out";
  }

  // Connection reset
  if (/\bECONNRESET\b/i.test(msg)) {
    return "Connection was reset";
  }
  if (/socket hang up/i.test(msg)) {
    return "Connection was reset";
  }

  // TLS handshake interrupted
  if (/Client network socket disconnected before secure TLS connection was established/i.test(msg)) {
    return "TLS connection could not be established";
  }

  // TLS / certificate issues
  if (/self\s*signed\s*certificate/i.test(msg)) {
    return "TLS certificate is self-signed";
  }
  if (/\bDEPTH_ZERO_SELF_SIGNED_CERT\b/i.test(msg)) {
    return "TLS certificate is self-signed";
  }
  if (/certificate has expired/i.test(msg)) {
    return "TLS certificate has expired";
  }
  if (/\bCERT_HAS_EXPIRED\b/i.test(msg)) {
    return "TLS certificate has expired";
  }
  if (/\bERR_TLS_CERT_ALTNAME_INVALID\b/i.test(msg)) {
    return "TLS certificate does not match the host";
  }
  if (/unable to verify the first certificate/i.test(msg)) {
    return "TLS certificate could not be verified";
  }
  if (/\bUNABLE_TO_VERIFY_LEAF_SIGNATURE\b/i.test(msg)) {
    return "TLS certificate could not be verified";
  }
  if (/\bERR_SSL_WRONG_VERSION_NUMBER\b/i.test(msg)) {
    return "TLS negotiation failed (wrong SSL/TLS version)";
  }

  // Bad URL
  if (/\bInvalid URL\b/i.test(msg)) {
    return "Invalid URL";
  }

  return msg;
}

export function formatUptime(ms: number): string {
  if (ms <= 0) return "—";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}
