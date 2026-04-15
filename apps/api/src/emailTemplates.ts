/**
 * Enterprise-grade HTML email templates for Edge Monitor notifications.
 *
 * All templates use table-based layout with inline styles for maximum
 * email client compatibility (Outlook, Gmail, Apple Mail, etc.).
 * Dark theme matches the dashboard aesthetic.
 */

/* ── colour palette (matches dashboard design tokens) ─────────────── */
const C = {
  bgOuter: "#030712",
  bgCard: "#111827",
  bgCardAlt: "#0d1321",
  borderCard: "#1e293b",
  borderSubtle: "#334155",
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  cyan: "#22d3ee",
  emerald: "#34d399",
  rose: "#fb7185",
  amber: "#fbbf24",
  violet: "#a78bfa",
} as const;

/* ── severity config ──────────────────────────────────────────────── */
type Severity = "critical" | "warning" | "info" | "success";

const SEVERITY: Record<Severity, { color: string; label: string; icon: string }> = {
  critical: { color: C.rose, label: "CRITICAL", icon: "&#10060;" },
  warning: { color: C.amber, label: "WARNING", icon: "&#9888;&#65039;" },
  info: { color: C.cyan, label: "INFO", icon: "&#8505;&#65039;" },
  success: { color: C.emerald, label: "RESOLVED", icon: "&#9989;" },
};

/* ── layout shell ─────────────────────────────────────────────────── */
function emailShell(opts: {
  severity: Severity;
  headline: string;
  subtitle?: string;
  rows: { label: string; value: string; mono?: boolean }[];
  footer?: string;
}): string {
  const sev = SEVERITY[opts.severity];

  const detailRows = opts.rows
    .map(
      (r) => `
    <tr>
      <td style="padding:10px 16px;font-size:13px;color:${C.textMuted};border-bottom:1px solid ${C.borderCard};white-space:nowrap;vertical-align:top;">
        ${r.label}
      </td>
      <td style="padding:10px 16px;font-size:14px;color:${C.textPrimary};border-bottom:1px solid ${C.borderCard};${r.mono ? `font-family:'JetBrains Mono',Menlo,Consolas,monospace;` : ""}word-break:break-all;">
        ${r.value}
      </td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${escHtml(opts.headline)}</title>
  <!--[if mso]>
  <style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.bgOuter};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.bgOuter};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- Inner container 560px max -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo bar -->
          <tr>
            <td style="padding:0 0 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(34,211,238,0.2),rgba(52,211,153,0.2));border:1px solid rgba(34,211,238,0.3);text-align:center;line-height:32px;font-size:16px;">
                      &#9889;
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">Edge</span><span style="font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;color:${C.cyan};">Monitor</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Severity banner -->
          <tr>
            <td style="background:${sev.color};border-radius:12px 12px 0 0;padding:14px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;color:${C.bgOuter};text-transform:uppercase;">
                    ${sev.icon}&nbsp;&nbsp;${sev.label}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background-color:${C.bgCard};border-left:1px solid ${C.borderCard};border-right:1px solid ${C.borderCard};padding:28px 24px 16px 24px;">
              <h1 style="margin:0 0 4px 0;font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;color:${C.textPrimary};line-height:1.3;">
                ${escHtml(opts.headline)}
              </h1>
              ${opts.subtitle ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:${C.textSecondary};line-height:1.5;">${escHtml(opts.subtitle)}</p>` : ""}
            </td>
          </tr>

          <!-- Detail rows -->
          <tr>
            <td style="background-color:${C.bgCardAlt};border-left:1px solid ${C.borderCard};border-right:1px solid ${C.borderCard};padding:8px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${detailRows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:${C.bgCard};border:1px solid ${C.borderCard};border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:${C.textMuted};line-height:1.6;">
                ${opts.footer ?? "This is an automated notification from Edge Monitor."}
              </p>
              <p style="margin:8px 0 0 0;font-family:Arial,sans-serif;font-size:11px;color:${C.borderSubtle};">
                Manage notification preferences in Settings &rarr; Alerts
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── HTML escaping ────────────────────────────────────────────────── */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background:${color};color:${C.bgOuter};font-size:12px;font-weight:700;letter-spacing:0.5px;">${escHtml(text)}</span>`;
}

/* ── public template builders ─────────────────────────────────────── */

export function webAppDownHtml(vars: {
  name: string;
  url: string;
  time: string;
  httpStatus: string;
  error: string;
}): string {
  return emailShell({
    severity: "critical",
    headline: `${vars.name} is DOWN`,
    subtitle: "An endpoint failed its health check and is unreachable.",
    rows: [
      { label: "Service", value: vars.name },
      { label: "URL", value: vars.url, mono: true },
      { label: "HTTP Status", value: statusBadge(vars.httpStatus === "-" ? "N/A" : vars.httpStatus, C.rose) },
      { label: "Error", value: vars.error, mono: true },
      { label: "Detected At", value: vars.time },
    ],
  });
}

export function serverAlertHtml(vars: {
  serverName: string;
  alertType: string;
  threshold: string;
  actualValue: string;
  time: string;
  status: string;
  isRepeat: boolean;
}): string {
  const severity: Severity = vars.isRepeat ? "warning" : "critical";
  const typeColor = vars.alertType === "CPU" ? C.amber : vars.alertType === "RAM" ? C.violet : C.rose;

  return emailShell({
    severity,
    headline: `${vars.serverName} — ${vars.alertType} Alert`,
    subtitle: vars.isRepeat
      ? "This alert is still active. Reminder notifications are sent every 30 minutes."
      : `A ${vars.alertType.toLowerCase()} alert has been triggered on this server.`,
    rows: [
      { label: "Server", value: vars.serverName },
      { label: "Alert Type", value: statusBadge(vars.alertType, typeColor) },
      { label: "Status", value: statusBadge(vars.status, vars.isRepeat ? C.amber : C.rose) },
      { label: "Threshold", value: vars.threshold, mono: true },
      ...(vars.actualValue !== "-" ? [{ label: "Actual Value", value: vars.actualValue, mono: true }] : []),
      { label: "Triggered At", value: vars.time },
    ],
    footer: "This alert will repeat every 30 minutes until resolved. Resolve alerts in the Edge Monitor dashboard.",
  });
}

export function testNotificationHtml(): string {
  return emailShell({
    severity: "info",
    headline: "Test Notification",
    subtitle: "This is a test email from Edge Monitor. If you received this, your SMTP configuration is working correctly.",
    rows: [
      { label: "Service", value: "TEST" },
      { label: "Status", value: statusBadge("OK", C.cyan) },
      { label: "Sent At", value: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC" },
    ],
    footer: "This was a test notification. No action is required.",
  });
}
