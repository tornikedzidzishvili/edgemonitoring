/**
 * React-email HTML templates for Edge Monitor notifications.
 *
 * Uses @react-email/components for the outer shell (Html, Head, Body)
 * and raw JSX table elements for the inner layout to preserve the
 * exact Outlook-compatible table structure from the previous templates.
 *
 * All three templates accept optional branding props:
 *   brandingLogoUrl  – if provided, renders a custom logo <img>
 *   platformName     – overrides the default "Edge"+"Monitor" wordmark text
 *
 * EMS-8 will read BrandingSettings from the DB and pass real values;
 * until then both props remain undefined and the defaults render as before.
 */

import { Html, Head, Body, Img } from "@react-email/components";
import React from "react";

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
  critical: { color: C.rose, label: "CRITICAL", icon: "❌" },
  warning: { color: C.amber, label: "WARNING", icon: "⚠️" },
  info: { color: C.cyan, label: "INFO", icon: "ℹ️" },
  success: { color: C.emerald, label: "RESOLVED", icon: "✅" },
};

/* ── shared branding props ────────────────────────────────────────── */
interface BrandingProps {
  /** If provided, renders a custom logo image instead of the ⚡ tile. */
  brandingLogoUrl?: string;
  /**
   * Overrides the default platform name.
   * Default renders as "Edge" (white) + "Monitor" (cyan).
   */
  platformName?: string;
}

/* ── Branding subcomponent ────────────────────────────────────────── */
function Branding({ brandingLogoUrl, platformName }: BrandingProps) {
  const iconCell = brandingLogoUrl ? (
    <td style={{ paddingRight: 10, verticalAlign: "middle" }}>
      <Img
        src={brandingLogoUrl}
        alt={platformName ?? "Edge Monitor"}
        width={32}
        height={32}
        style={{ borderRadius: 8, display: "block" }}
      />
    </td>
  ) : (
    <td style={{ paddingRight: 10, verticalAlign: "middle" }}>
      {/* Default ⚡ gradient tile */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg,rgba(34,211,238,0.2),rgba(52,211,153,0.2))",
          border: "1px solid rgba(34,211,238,0.3)",
          textAlign: "center",
          lineHeight: "32px",
          fontSize: 16,
        }}
      >
        ⚡
      </div>
    </td>
  );

  // When a custom platformName is provided, render it as a single styled span.
  // When using the default, preserve the two-tone "Edge" + "Monitor" wordmark.
  const wordmark = platformName ? (
    <span
      style={{
        fontFamily: "'Space Grotesk',Arial,sans-serif",
        fontSize: 18,
        fontWeight: 700,
        color: "#ffffff",
      }}
    >
      {platformName}
    </span>
  ) : (
    <>
      <span
        style={{
          fontFamily: "'Space Grotesk',Arial,sans-serif",
          fontSize: 18,
          fontWeight: 700,
          color: "#ffffff",
        }}
      >
        Edge
      </span>
      <span
        style={{
          fontFamily: "'Space Grotesk',Arial,sans-serif",
          fontSize: 18,
          fontWeight: 700,
          color: C.cyan,
        }}
      >
        Monitor
      </span>
    </>
  );

  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
      <tbody>
        <tr>
          {iconCell}
          <td style={{ verticalAlign: "middle" }}>{wordmark}</td>
        </tr>
      </tbody>
    </table>
  );
}

/* ── StatusBadge helper ───────────────────────────────────────────── */
function StatusBadge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        background: color,
        color: C.bgOuter,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.5px",
      }}
    >
      {text}
    </span>
  );
}

/* ── DetailRow helper ─────────────────────────────────────────────── */
interface DetailRowItem {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function DetailRows({ rows }: { rows: DetailRowItem[] }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderCollapse: "collapse", width: "100%" }}
    >
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td
              style={{
                padding: "10px 16px",
                fontSize: 13,
                color: C.textMuted,
                borderBottom: `1px solid ${C.borderCard}`,
                whiteSpace: "nowrap",
                verticalAlign: "top",
              }}
            >
              {r.label}
            </td>
            <td
              style={{
                padding: "10px 16px",
                fontSize: 14,
                color: C.textPrimary,
                borderBottom: `1px solid ${C.borderCard}`,
                wordBreak: "break-all",
                ...(r.mono
                  ? { fontFamily: "'JetBrains Mono',Menlo,Consolas,monospace" }
                  : {}),
              }}
            >
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── EmailShell layout ────────────────────────────────────────────── */
interface EmailShellProps extends BrandingProps {
  severity: Severity;
  headline: string;
  subtitle?: string;
  rows: DetailRowItem[];
  footer?: string;
}

function EmailShell({
  severity,
  headline,
  subtitle,
  rows,
  footer,
  brandingLogoUrl,
  platformName,
}: EmailShellProps) {
  const sev = SEVERITY[severity];

  return (
    <Html lang="en">
      <Head>
        {/* colour-scheme meta must go inside <head> */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        {/*[if mso]>
        <style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style>
        <![endif]*/}
      </Head>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: C.bgOuter,
          WebkitTextSizeAdjust: "100%",
        }}
      >
        {/* Outer wrapper */}
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: "collapse", backgroundColor: C.bgOuter }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                {/* Inner 560px container */}
                <table
                  role="presentation"
                  width={560}
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ maxWidth: 560, width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    {/* Logo bar */}
                    <tr>
                      <td style={{ padding: "0 0 24px 0" }}>
                        <Branding
                          brandingLogoUrl={brandingLogoUrl}
                          platformName={platformName}
                        />
                      </td>
                    </tr>

                    {/* Severity banner */}
                    <tr>
                      <td
                        style={{
                          background: sev.color,
                          borderRadius: "12px 12px 0 0",
                          padding: "14px 24px",
                        }}
                      >
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ borderCollapse: "collapse" }}
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  fontFamily: "Arial,sans-serif",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  letterSpacing: "1.5px",
                                  color: C.bgOuter,
                                  textTransform: "uppercase",
                                }}
                              >
                                {sev.icon}&nbsp;&nbsp;{sev.label}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* Main card */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: C.bgCard,
                          borderLeft: `1px solid ${C.borderCard}`,
                          borderRight: `1px solid ${C.borderCard}`,
                          padding: "28px 24px 16px 24px",
                        }}
                      >
                        <h1
                          style={{
                            margin: "0 0 4px 0",
                            fontFamily: "'Space Grotesk',Arial,sans-serif",
                            fontSize: 22,
                            fontWeight: 700,
                            color: C.textPrimary,
                            lineHeight: 1.3,
                          }}
                        >
                          {headline}
                        </h1>
                        {subtitle && (
                          <p
                            style={{
                              margin: 0,
                              fontFamily: "Arial,sans-serif",
                              fontSize: 14,
                              color: C.textSecondary,
                              lineHeight: 1.5,
                            }}
                          >
                            {subtitle}
                          </p>
                        )}
                      </td>
                    </tr>

                    {/* Detail rows */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: C.bgCardAlt,
                          borderLeft: `1px solid ${C.borderCard}`,
                          borderRight: `1px solid ${C.borderCard}`,
                          padding: "8px 8px",
                        }}
                      >
                        <DetailRows rows={rows} />
                      </td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: C.bgCard,
                          border: `1px solid ${C.borderCard}`,
                          borderTop: "none",
                          borderRadius: "0 0 12px 12px",
                          padding: "20px 24px",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontFamily: "Arial,sans-serif",
                            fontSize: 12,
                            color: C.textMuted,
                            lineHeight: 1.6,
                          }}
                        >
                          {footer ?? "This is an automated notification from Edge Monitor."}
                        </p>
                        <p
                          style={{
                            margin: "8px 0 0 0",
                            fontFamily: "Arial,sans-serif",
                            fontSize: 11,
                            color: C.borderSubtle,
                          }}
                        >
                          Manage notification preferences in Settings → Alerts
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

/* ── Public template components ───────────────────────────────────── */

export interface WebAppDownEmailProps extends BrandingProps {
  name: string;
  url: string;
  time: string;
  httpStatus: string;
  error: string;
}

export function WebAppDownEmail({
  name,
  url,
  time,
  httpStatus,
  error,
  brandingLogoUrl,
  platformName,
}: WebAppDownEmailProps) {
  return (
    <EmailShell
      severity="critical"
      headline={`${name} is DOWN`}
      subtitle="An endpoint failed its health check and is unreachable."
      rows={[
        { label: "Service", value: name },
        { label: "URL", value: url, mono: true },
        {
          label: "HTTP Status",
          value: (
            <StatusBadge
              text={httpStatus === "-" ? "N/A" : httpStatus}
              color={C.rose}
            />
          ),
        },
        { label: "Error", value: error, mono: true },
        { label: "Detected At", value: time },
      ]}
      brandingLogoUrl={brandingLogoUrl}
      platformName={platformName}
    />
  );
}

export interface ServerAlertEmailProps extends BrandingProps {
  serverName: string;
  alertType: string;
  threshold: string;
  actualValue: string;
  time: string;
  status: string;
  isRepeat: boolean;
}

export function ServerAlertEmail({
  serverName,
  alertType,
  threshold,
  actualValue,
  time,
  status,
  isRepeat,
  brandingLogoUrl,
  platformName,
}: ServerAlertEmailProps) {
  const severity: Severity = isRepeat ? "warning" : "critical";
  const typeColor =
    alertType === "CPU" ? C.amber : alertType === "RAM" ? C.violet : C.rose;

  const rows: DetailRowItem[] = [
    { label: "Server", value: serverName },
    {
      label: "Alert Type",
      value: <StatusBadge text={alertType} color={typeColor} />,
    },
    {
      label: "Status",
      value: (
        <StatusBadge text={status} color={isRepeat ? C.amber : C.rose} />
      ),
    },
    { label: "Threshold", value: threshold, mono: true },
    ...(actualValue !== "-"
      ? [{ label: "Actual Value", value: actualValue, mono: true }]
      : []),
    { label: "Triggered At", value: time },
  ];

  return (
    <EmailShell
      severity={severity}
      headline={`${serverName} — ${alertType} Alert`}
      subtitle={
        isRepeat
          ? "This alert is still active. Reminder notifications are sent every 30 minutes."
          : `A ${alertType.toLowerCase()} alert has been triggered on this server.`
      }
      rows={rows}
      footer="This alert will repeat every 30 minutes until resolved. Resolve alerts in the Edge Monitor dashboard."
      brandingLogoUrl={brandingLogoUrl}
      platformName={platformName}
    />
  );
}

export interface SharedHostingAlertEmailProps extends BrandingProps {
  serverName: string;
  serviceName: string;
  /** "active" = service went down; "resolved" = service recovered */
  alertStatus: "active" | "resolved";
  time: string;
}

export function SharedHostingAlertEmail({
  serverName,
  serviceName,
  alertStatus,
  time,
  brandingLogoUrl,
  platformName,
}: SharedHostingAlertEmailProps) {
  const isResolved = alertStatus === "resolved";
  const severity: Severity = isResolved ? "success" : "critical";

  return (
    <EmailShell
      severity={severity}
      headline={
        isResolved
          ? `CyberPanel service ${serviceName} recovered`
          : `CyberPanel service ${serviceName} is inactive`
      }
      subtitle={
        isResolved
          ? `The ${serviceName} service on ${serverName} has returned to active status.`
          : `The ${serviceName} service on ${serverName} has been inactive for 2 consecutive sync cycles.`
      }
      rows={[
        { label: "Server", value: serverName },
        { label: "Service", value: serviceName, mono: true },
        {
          label: "Status",
          value: (
            <StatusBadge
              text={isResolved ? "RESOLVED" : "INACTIVE"}
              color={isResolved ? C.emerald : C.rose}
            />
          ),
        },
        { label: isResolved ? "Resolved At" : "Detected At", value: time },
      ]}
      footer={
        isResolved
          ? "The service has recovered. No further action is required."
          : "This alert fires after 2 consecutive sync cycles of inactivity to avoid false positives from brief restarts."
      }
      brandingLogoUrl={brandingLogoUrl}
      platformName={platformName}
    />
  );
}

export interface TestNotificationEmailProps extends BrandingProps {}

export function TestNotificationEmail({
  brandingLogoUrl,
  platformName,
}: TestNotificationEmailProps) {
  const sentAt =
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <EmailShell
      severity="info"
      headline="Test Notification"
      subtitle="This is a test email from Edge Monitor. If you received this, your SMTP configuration is working correctly."
      rows={[
        { label: "Service", value: "TEST" },
        {
          label: "Status",
          value: <StatusBadge text="OK" color={C.cyan} />,
        },
        { label: "Sent At", value: sentAt },
      ]}
      footer="This was a test notification. No action is required."
      brandingLogoUrl={brandingLogoUrl}
      platformName={platformName}
    />
  );
}
