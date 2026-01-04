export type WebAppSummary = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  server: { id: string; name: string } | null;
  lastCheck: {
    checkedAt: string;
    ok: boolean;
    httpStatus: number | null;
    responseTimeMs: number | null;
    error: string | null;
  } | null;
  uptime24h: number | null;
  uptime7d: number | null;
};

export type WebAppDetail = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  server: { id: string; name: string; lastSeenAt: string | null } | null;
  lastCheck: WebAppSummary["lastCheck"];
  latestReport: { reportedAt: string; payload: unknown } | null;
};

export type UptimePoint = {
  checkedAt: string;
  ok: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  error: string | null;
};

export type ServerInfo = {
  id: string;
  name: string;
  ip?: string | null;
  vendor?: string | null;
  specs?: unknown | null;
  sshUser?: string | null;
  sshPort?: number | null;
  sshKeyId?: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type SshKeyInfo = {
  id: string;
  name: string;
  username: string | null;
  port: number | null;
  createdAt: string;
};

export type SshProbeResult = {
  serverId: string;
  serverName: string;
  collectedAt: string;
  target: { host: string; port: number; username: string };
  system: unknown;
  docker?: unknown;
};

export type DashboardRange = "24h" | "7d" | "30d";

export type DashboardResponse = {
  generatedAt: string;
  range: DashboardRange;
  servers: {
    total: number;
    active: number;
    activeWindowSeconds: number;
    recent: Array<{ id: string; name: string; vendor: string | null; lastSeenAt: string | null }>;
  };
  webapps: {
    total: number;
    up: number;
    down: number;
    unknown: number;
    items: WebAppSummary[];
  };
  uptimeSeries: Array<{ bucketStart: string; okPct: number | null; okCount: number; totalCount: number }>;
  recentFailures: Array<{
    webAppId: string;
    webAppName: string;
    checkedAt: string;
    httpStatus: number | null;
    responseTimeMs: number | null;
    error: string | null;
  }>;
};

export type ServerDetail = {
  id: string;
  name: string;
  ip?: string | null;
  vendor?: string | null;
  specs?: unknown | null;
  sshUser?: string | null;
  sshPort?: number | null;
  sshKeyId?: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  latestReport: { reportedAt: string; payload: unknown } | null;
};

export type ServerDashboardItem = {
  id: string;
  name: string;
  ip: string | null;
  vendor: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  uptimeMs: number;
  buckets: boolean[]; // 24 buckets for last 12h
};

export type ServerDashboardResponse = {
  generatedAt: string;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    active: number;
    activeWindowSeconds: number;
  };
  servers: ServerDashboardItem[];
};

export type ServerEndpoint = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  createdAt: string;
  lastCheck: {
    checkedAt: string;
    ok: boolean;
    httpStatus: number | null;
    responseTimeMs: number | null;
    error: string | null;
  } | null;
  uptime24h: number | null;
  buckets: (boolean | null)[]; // 24 buckets for last 12h (null = no data, true = up, false = down)
};

export type ServerEndpointsResponse = {
  serverId: string;
  endpoints: ServerEndpoint[];
};

export type ServerMetricsPoint = {
  t: string;
  cpuLoad: number | null;
  memUsedPct: number | null;
  samples: number;
};

export type ServerMetricsResponse = {
  serverId: string;
  generatedAt: string;
  from: string;
  to: string;
  days: 1 | 5 | 15 | 30;
  stepMinutes: 5 | 15 | 30 | 60;
  points: ServerMetricsPoint[];
};

export type UserInfo = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  position: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type SmtpSettingsInfo = {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string | null;
  updatedAt: string;
};

export type SmtpSettingsResponse = {
  configured: boolean;
  settings: SmtpSettingsInfo | null;
};

export type SmsSettingsInfo = {
  id: string;
  enabled: boolean;
  senderName: string | null;
  hasApiKey: boolean;
  updatedAt: string;
};

export type SmsSettingsResponse = {
  configured: boolean;
  settings: SmsSettingsInfo | null;
};

export type AlertRecipientInfo = {
  id: string;
  user: { id: string; fullName: string; email: string };
  email: string | null;
  phone: string | null;
  method: "none" | "email" | "sms" | "both";
  updatedAt: string;
};

export type AlertRecipientsResponse = {
  recipients: AlertRecipientInfo[];
};

export type AlertTemplatesInfo = {
  id: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  updatedAt: string;
};

export type AlertTemplatesResponse = {
  templates: AlertTemplatesInfo;
};

export type TestAlertsResponse = {
  ok: boolean;
  result: {
    email: { attempted: boolean; sent: boolean; error?: string };
    sms: { attempted: boolean; sent: boolean; error?: string };
  };
};

export type SslStatus = "valid" | "warning" | "critical" | "unknown";

export type SharedHostingSummary = {
  id: string;
  name: string;
  createdAt: string;
  domainCount: number;
  issuesCount: number;
};

export type DomainCheckInfo = {
  checkedAt: string;
  httpOk: boolean | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  httpError: string | null;
  currentIp: string | null;
  ipChanged: boolean;
};

export type SharedHostingDomainInfo = {
  id: string;
  domain: string;
  enabled: boolean;
  createdAt: string;
  sslExpiresAt: string | null;
  sslIssuer: string | null;
  sslStatus: SslStatus;
  sslLastChecked: string | null;
  lastKnownIp: string | null;
  dnsLastChecked: string | null;
  lastCheck: DomainCheckInfo | null;
  uptime24h: number | null;
};

export type SharedHostingDetail = {
  id: string;
  name: string;
  createdAt: string;
  domains: SharedHostingDomainInfo[];
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const TOKEN_KEY = "edge_monitoring_token";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, headers?: Record<string, string>) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...(headers ?? {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function apiGet<T>(path: string, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>("GET", path, undefined, headers);
}

async function apiPost<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>("POST", path, body, headers);
}

async function apiPatch<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>("PATCH", path, body, headers);
}

async function apiDelete<T>(path: string, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>("DELETE", path, undefined, headers);
}

export const api = {
  webapps: () => apiGet<WebAppSummary[]>(`/webapps`),
  webapp: (id: string) => apiGet<WebAppDetail>(`/webapps/${encodeURIComponent(id)}`),
  uptime: (id: string, range: "24h" | "7d" | "30d") =>
    apiGet<UptimePoint[]>(`/webapps/${encodeURIComponent(id)}/uptime?range=${range}`),
  dashboard: (range: DashboardRange) => apiGet<DashboardResponse>(`/dashboard?range=${range}`),
  servers: () => apiGet<ServerInfo[]>(`/servers`),
  serversDashboard: (page = 1, limit = 20) =>
    apiGet<ServerDashboardResponse>(`/servers/dashboard?page=${page}&limit=${limit}`),
  server: (id: string) => apiGet<ServerDetail>(`/servers/${encodeURIComponent(id)}`),
  serverMetrics: (id: string, params: { days: 1 | 5 | 15 | 30; stepMinutes: 5 | 15 | 30 | 60 }) =>
    apiGet<ServerMetricsResponse>(
      `/servers/${encodeURIComponent(id)}/metrics?days=${params.days}&stepMinutes=${params.stepMinutes}`
    ),
  serverEndpoints: (id: string) => apiGet<ServerEndpointsResponse>(`/servers/${encodeURIComponent(id)}/endpoints`),
  adminCreateWebapp: (params: { name: string; url: string; serverId?: string }) =>
    apiPost<{ id: string }>(`/admin/webapps`, { name: params.name, url: params.url, serverId: params.serverId || undefined }),

  adminCreateSshKey: (params: {
    name: string;
    privateKey: string;
    passphrase?: string;
    username?: string;
    port?: number;
  }) =>
    apiPost<SshKeyInfo>(
      `/admin/ssh-keys`,
      {
        name: params.name,
        privateKey: params.privateKey,
        passphrase: params.passphrase || undefined,
        username: params.username || undefined,
        port: params.port || undefined
      }
    ),

    adminListSshKeys: () => apiGet<SshKeyInfo[]>(`/admin/ssh-keys`),

  adminCreateServer: (params: {
    name: string;
    ip?: string;
    vendor?: string;
    specs?: unknown;
    sshUser?: string;
    sshPort?: number;
    sshKeyId?: string;
    createAgentKey?: boolean;
  }) =>
    apiPost<{ server: ServerInfo; apiKey?: string }>(
      `/admin/servers`,
      {
        name: params.name,
        ip: params.ip || undefined,
        vendor: params.vendor || undefined,
        specs: params.specs ?? undefined,
        sshUser: params.sshUser || undefined,
        sshPort: params.sshPort || undefined,
        sshKeyId: params.sshKeyId || undefined,
        createAgentKey: params.createAgentKey === true
      }
    ),

  adminGenerateServerAgentKey: (params: { id: string }) =>
    apiPost<{ serverId: string; apiKey: string }>(`/admin/servers/${encodeURIComponent(params.id)}/agent-key`, {}),

  adminUpdateServer: (params: {
    id: string;
    name?: string;
    ip?: string | null;
    vendor?: string | null;
    specs?: unknown | null;
    sshUser?: string | null;
    sshPort?: number | null;
    sshKeyId?: string | null;
  }) =>
    apiPatch<ServerInfo>(
      `/admin/servers/${encodeURIComponent(params.id)}`,
      {
        name: params.name,
        ip: params.ip,
        vendor: params.vendor,
        specs: params.specs,
        sshUser: params.sshUser,
        sshPort: params.sshPort,
        sshKeyId: params.sshKeyId
      }
    ),

  adminDeleteServer: (params: { id: string }) =>
    apiDelete<{ ok: boolean }>(`/admin/servers/${encodeURIComponent(params.id)}`),

  adminProbeServer: (params: { id: string }) => apiPost<SshProbeResult>(`/admin/servers/${encodeURIComponent(params.id)}/probe`, {}),

  // User management
  users: () => apiGet<{ users: UserInfo[] }>(`/users`),
  user: (id: string) => apiGet<{ user: UserInfo }>(`/users/${encodeURIComponent(id)}`),
  createUser: (params: { email: string; password: string; fullName: string; phone?: string; position?: string; role?: "admin" | "user" }) =>
    apiPost<{ user: UserInfo }>(`/users`, params),
  updateUser: (id: string, params: { email?: string; fullName?: string; phone?: string | null; position?: string | null; role?: "admin" | "user"; password?: string }) =>
    apiPatch<{ user: UserInfo }>(`/users/${encodeURIComponent(id)}`, params),
  deleteUser: (id: string) => apiDelete<{ ok: boolean }>(`/users/${encodeURIComponent(id)}`),

  // SMTP settings
  smtpSettings: () => apiGet<SmtpSettingsResponse>(`/settings/smtp`),
  saveSmtpSettings: (params: { host: string; port: number; secure: boolean; username?: string | null; password?: string | null; fromEmail: string; fromName?: string | null }) =>
    apiPost<{ settings: SmtpSettingsInfo }>(`/settings/smtp`, params),
  testSmtp: (testEmail: string) => apiPost<{ ok: boolean; message: string }>(`/settings/smtp/test`, { testEmail }),
  deleteSmtpSettings: () => apiDelete<{ ok: boolean }>(`/settings/smtp`),

  // SMS settings
  smsSettings: () => apiGet<SmsSettingsResponse>(`/settings/sms`),
  saveSmsSettings: (params: { enabled: boolean; senderName?: string | null; apiKey?: string | null }) =>
    apiPost<{ settings: SmsSettingsInfo }>(`/settings/sms`, params),

  // Alerts
  alertRecipients: () => apiGet<AlertRecipientsResponse>(`/settings/alerts/recipients`),
  saveAlertRecipient: (params: { userId: string; email?: string | null; phone?: string | null; method: "none" | "email" | "sms" | "both" }) =>
    apiPost<{ recipient: AlertRecipientInfo }>(`/settings/alerts/recipients`, params),
  testAlerts: (params: { email?: string | null; phone?: string | null }) =>
    apiPost<TestAlertsResponse>(`/settings/alerts/test`, params),
  alertTemplates: () => apiGet<AlertTemplatesResponse>(`/settings/templates/alerts`),
  saveAlertTemplates: (params: { emailSubject: string; emailBody: string; smsBody: string }) =>
    apiPost<AlertTemplatesResponse>(`/settings/templates/alerts`, params),

  // Shared Hosting
  sharedHosting: () => apiGet<SharedHostingSummary[]>(`/shared-hosting`),
  sharedHostingDetail: (id: string) => apiGet<SharedHostingDetail>(`/shared-hosting/${encodeURIComponent(id)}`),
  sharedHostingDomainHistory: (id: string, domainId: string, range: "24h" | "7d" | "30d" = "24h") =>
    apiGet<DomainCheckInfo[]>(`/shared-hosting/${encodeURIComponent(id)}/domains/${encodeURIComponent(domainId)}/history?range=${range}`),

  adminCreateSharedHosting: (params: { name: string }) =>
    apiPost<{ id: string; name: string; createdAt: string }>(`/admin/shared-hosting`, params),
  adminUpdateSharedHosting: (id: string, params: { name?: string }) =>
    apiPatch<{ id: string; name: string; createdAt: string }>(`/admin/shared-hosting/${encodeURIComponent(id)}`, params),
  adminDeleteSharedHosting: (id: string) =>
    apiDelete<{ ok: boolean }>(`/admin/shared-hosting/${encodeURIComponent(id)}`),

  adminAddDomain: (sharedHostingId: string, params: { domain: string }) =>
    apiPost<{ id: string; domain: string; enabled: boolean; createdAt: string }>(
      `/admin/shared-hosting/${encodeURIComponent(sharedHostingId)}/domains`,
      params
    ),
  adminUpdateDomain: (sharedHostingId: string, domainId: string, params: { domain?: string; enabled?: boolean }) =>
    apiPatch<{ id: string; domain: string; enabled: boolean; createdAt: string }>(
      `/admin/shared-hosting/${encodeURIComponent(sharedHostingId)}/domains/${encodeURIComponent(domainId)}`,
      params
    ),
  adminDeleteDomain: (sharedHostingId: string, domainId: string) =>
    apiDelete<{ ok: boolean }>(
      `/admin/shared-hosting/${encodeURIComponent(sharedHostingId)}/domains/${encodeURIComponent(domainId)}`
    )
};
