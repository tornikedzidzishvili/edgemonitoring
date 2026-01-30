# Edge Monitoring API Documentation

Complete API reference for building the iOS app. All endpoints, data models, and authentication patterns - verified against production source code.

---

## Table of Contents

1. [Base Configuration](#base-configuration)
2. [Authentication](#authentication)
3. [Data Models](#data-models)
4. [API Endpoints](#api-endpoints)
   - [Health & Setup](#health--setup)
   - [Authentication](#authentication-endpoints)
   - [Users](#users)
   - [Servers](#servers)
   - [Server Metrics](#server-metrics)
   - [Server Alerting](#server-alerting)
   - [Alerts](#alerts)
   - [Web Applications (Uptime)](#web-applications-uptime)
   - [Shared Hosting](#shared-hosting)
   - [SSH Keys](#ssh-keys)
   - [Settings](#settings)
   - [Dashboard](#dashboard)
5. [Error Handling](#error-handling)
6. [Real-time Updates (SSE)](#real-time-updates-sse)

---

## Base Configuration

```
Base URL: https://your-api-domain.com
Content-Type: application/json
```

---

## Authentication

### Session-Based Authentication (For iOS App)

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <session_token>
```

**Token Lifecycle:**
- Tokens are issued on login/setup
- Tokens expire after **7 days**
- Store token securely in iOS Keychain
- On 401 response, redirect to login

### Agent API Key (Server Monitoring Agents)

For server agents submitting reports:

```
X-Agent-Key: <32-byte-hex-api-key>
```

### Authorization Levels

| Level | Description |
|-------|-------------|
| `none` | Public endpoint, no auth required |
| `requireAuth` | Valid session token required |
| `requireAdmin` | Valid session token + `role: "admin"` required |

---

## Data Models

### User

```json
{
  "id": "string (UUID)",
  "email": "string",
  "fullName": "string",
  "phone": "string | null",
  "position": "string | null",
  "role": "admin | user",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

### Server

```json
{
  "id": "string (UUID)",
  "name": "string",
  "ip": "string | null",
  "vendor": "string | null",
  "specs": "object | null",
  "sshUser": "string | null",
  "sshPort": "number | null",
  "sshKeyId": "string | null",
  "lastSeenAt": "ISO 8601 datetime | null",
  "createdAt": "ISO 8601 datetime"
}
```

### Server Report Payload (From Agents)

The agent sends this payload structure to `/agents/report`:

```json
{
  "system": {
    "cpu": {
      "load": "number (0-100)"
    },
    "mem": {
      "used": "number (bytes)",
      "total": "number (bytes)"
    }
  }
}
```

**Note:** The full payload can include additional fields - above are the ones used for metrics aggregation.

### Server Metric Point (Historical)

```json
{
  "t": "ISO 8601 datetime",
  "cpuLoad": "number (0-100) | null",
  "memUsedPct": "number (0-100) | null",
  "samples": "number"
}
```

### WebApp

```json
{
  "id": "string (UUID)",
  "name": "string",
  "url": "string (URL)",
  "enabled": "boolean",
  "server": {
    "id": "string",
    "name": "string"
  } | null,
  "lastCheck": {
    "checkedAt": "ISO 8601 datetime",
    "ok": "boolean",
    "httpStatus": "number | null",
    "responseTimeMs": "number | null",
    "error": "string | null"
  } | null,
  "uptime24h": "number (0-1 decimal) | null",
  "uptime7d": "number (0-1 decimal) | null"
}
```

**Note:** `uptime24h` and `uptime7d` are decimals (0.998 = 99.8%), NOT percentages.

### Uptime Check Result

```json
{
  "checkedAt": "ISO 8601 datetime",
  "ok": "boolean",
  "httpStatus": "number | null",
  "responseTimeMs": "number | null",
  "error": "string | null"
}
```

### Shared Hosting Account

```json
{
  "id": "string (UUID)",
  "name": "string",
  "createdAt": "ISO 8601 datetime",
  "domainCount": "number",
  "issuesCount": "number"
}
```

### Shared Hosting Domain

```json
{
  "id": "string (UUID)",
  "domain": "string",
  "enabled": "boolean",
  "createdAt": "ISO 8601 datetime",
  "sslExpiresAt": "ISO 8601 datetime | null",
  "sslIssuer": "string | null",
  "sslStatus": "ok | warning | critical | unknown",
  "sslLastChecked": "ISO 8601 datetime | null",
  "lastKnownIp": "string | null",
  "dnsLastChecked": "ISO 8601 datetime | null",
  "lastCheck": {
    "checkedAt": "ISO 8601 datetime",
    "httpOk": "boolean",
    "httpStatus": "number | null",
    "responseTimeMs": "number | null",
    "httpError": "string | null",
    "currentIp": "string | null",
    "ipChanged": "boolean"
  } | null,
  "uptime24h": "number (0-1 decimal) | null"
}
```

### SSH Key (Metadata Only)

```json
{
  "id": "string (UUID)",
  "name": "string",
  "username": "string | null",
  "port": "number | null",
  "createdAt": "ISO 8601 datetime"
}
```

### Server Alert

```json
{
  "id": "string (UUID)",
  "server": {
    "id": "string",
    "name": "string"
  },
  "type": "cpu | ram | offline",
  "thresholdValue": "number | null",
  "actualValue": "number | null",
  "status": "active | resolved",
  "triggeredAt": "ISO 8601 datetime",
  "resolvedAt": "ISO 8601 datetime | null",
  "resolvedBy": {
    "id": "string",
    "fullName": "string"
  } | null,
  "lastNotifiedAt": "ISO 8601 datetime | null",
  "notificationCount": "number",
  "duration": "number (milliseconds)"
}
```

**Note:** `duration` is in **milliseconds**, not minutes.

### Alert Recipient

```json
{
  "id": "string (UUID)",
  "user": {
    "id": "string",
    "fullName": "string",
    "email": "string"
  },
  "email": "string | null",
  "phone": "string | null",
  "method": "none | email | sms | both",
  "updatedAt": "ISO 8601 datetime"
}
```

---

## API Endpoints

### Health & Setup

#### Check API Health

```
GET /health
Auth: none
```

**Response:**
```json
{
  "ok": true
}
```

---

#### Check Setup Required

```
GET /auth/setup-required
Auth: none
```

**Response:**
```json
{
  "setupRequired": true
}
```

Use this on app launch to determine if initial setup is needed.

---

### Authentication Endpoints

#### Initial Setup (Create First Admin)

```
POST /auth/setup
Auth: none
```

Only works if no users exist in the system.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "minimum8chars",
  "fullName": "John Admin",
  "position": "System Administrator"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | yes | Valid email format |
| password | string | yes | Minimum 8 characters |
| fullName | string | yes | Minimum 1 character |
| position | string | no | Optional |

**Response (Success):**
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "fullName": "John Admin",
    "position": "System Administrator",
    "role": "admin"
  },
  "token": "session_token_string"
}
```

**Response (Error - 400 if setup already complete):**
```json
{
  "error": "setup-already-complete",
  "message": "Setup has already been completed"
}
```

---

#### Login

```
POST /auth/login
Auth: none
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

**Response (Success):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "User Name",
    "position": "Developer",
    "role": "user"
  },
  "token": "session_token_string"
}
```

**Response (Error - 401):**
```json
{
  "error": "invalid-credentials",
  "message": "Invalid email or password"
}
```

---

#### Logout

```
POST /auth/logout
Auth: requireAuth
```

**Request:** Empty body

**Response:**
```json
{
  "ok": true
}
```

---

#### Get Current User

```
GET /auth/me
Auth: requireAuth
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "User Name",
    "position": "Developer",
    "role": "user"
  }
}
```

---

#### Change Password

```
POST /auth/change-password
Auth: requireAuth
```

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword8+"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| currentPassword | string | yes | Minimum 1 character |
| newPassword | string | yes | Minimum 8 characters |

**Response (Success):**
```json
{
  "ok": true
}
```

**Response (Error - 401):**
```json
{
  "error": "invalid-password",
  "message": "Current password is incorrect"
}
```

---

### Users

#### List All Users

```
GET /users
Auth: requireAdmin
```

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "User Name",
      "phone": "+1234567890",
      "position": "Developer",
      "role": "user",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

#### Get User by ID

```
GET /users/:id
Auth: requireAdmin
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "User Name",
    "phone": "+1234567890",
    "position": "Developer",
    "role": "user",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Create User

```
POST /users
Auth: requireAdmin
```

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "minimum8chars",
  "fullName": "New User",
  "phone": "+1234567890",
  "position": "Designer",
  "role": "user"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | yes | Valid email, unique |
| password | string | yes | Minimum 8 characters |
| fullName | string | yes | Minimum 1 character |
| phone | string | no | Minimum 3 characters if provided |
| position | string | no | Optional |
| role | string | no | "admin" or "user" (default: "user") |

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "fullName": "New User",
    "phone": "+1234567890",
    "position": "Designer",
    "role": "user",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Error - 400):**
```json
{
  "error": "email-exists",
  "message": "A user with this email already exists"
}
```

---

#### Update User

```
PATCH /users/:id
Auth: requireAdmin
```

**Request:** (all fields optional)
```json
{
  "email": "updated@example.com",
  "fullName": "Updated Name",
  "phone": "+0987654321",
  "position": "Senior Developer",
  "role": "admin",
  "password": "newpassword8+"
}
```

| Field | Type | Validation |
|-------|------|------------|
| email | string | Valid email, unique |
| fullName | string | Minimum 1 character |
| phone | string \| null | Minimum 3 characters or null |
| position | string \| null | Optional |
| role | string | "admin" or "user" |
| password | string | Minimum 8 characters |

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "updated@example.com",
    "fullName": "Updated Name",
    "phone": "+0987654321",
    "position": "Senior Developer",
    "role": "admin",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-16T14:20:00.000Z"
  }
}
```

---

#### Delete User

```
DELETE /users/:id
Auth: requireAdmin
```

**Response:**
```json
{
  "ok": true
}
```

**Error Cases:**
- Cannot delete yourself: `{ "error": "cannot-delete-self", "message": "You cannot delete your own account" }`
- Cannot delete last admin: `{ "error": "cannot-delete-last-admin", "message": "Cannot delete the last admin user" }`

---

### Servers

#### List All Servers

```
GET /servers
Auth: none
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Production Server",
    "ip": "192.168.1.100",
    "vendor": "DigitalOcean",
    "specs": { ... },
    "sshUser": "root",
    "sshPort": 22,
    "sshKeyId": "uuid",
    "lastSeenAt": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

#### Get Dashboard Summary

```
GET /servers/dashboard
Auth: none
```

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| page | number | 1 | - | Page number |
| limit | number | 20 | 100 | Items per page |

**Response:**
```json
{
  "generatedAt": "2024-01-15T10:30:00.000Z",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "totalPages": 1
  },
  "summary": {
    "total": 10,
    "active": 8,
    "activeWindowSeconds": 300
  },
  "servers": [
    {
      "id": "uuid",
      "name": "Production Server",
      "ip": "192.168.1.100",
      "vendor": "DigitalOcean",
      "isActive": true,
      "lastSeenAt": "2024-01-15T10:30:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "uptimeMs": 1234567890,
      "buckets": [true, true, true, false, true, ...]
    }
  ]
}
```

**Notes:**
- `isActive` is `true` if server reported within last 5 minutes (300 seconds)
- `buckets` is an array of 24 booleans representing last 12 hours (30-min each bucket)
- `uptimeMs` is milliseconds since server was created (if lastSeenAt exists)

---

#### Get Server Details

```
GET /servers/:id
Auth: none
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Production Server",
  "ip": "192.168.1.100",
  "vendor": "DigitalOcean",
  "specs": { ... },
  "sshUser": "root",
  "sshPort": 22,
  "sshKeyId": "uuid",
  "lastSeenAt": "2024-01-15T10:30:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "latestReport": {
    "reportedAt": "2024-01-15T10:30:00.000Z",
    "payload": { ... }
  }
}
```

The `payload` contains the raw agent report data.

---

#### Create Server

```
POST /admin/servers
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "name": "New Server",
  "ip": "192.168.1.101",
  "vendor": "AWS",
  "specs": { ... },
  "sshUser": "ubuntu",
  "sshPort": 22,
  "sshKeyId": "uuid",
  "createAgentKey": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Minimum 1 character |
| ip | string | no | IP address |
| vendor | string | no | Cloud provider/vendor |
| specs | any | no | Hardware specifications |
| sshUser | string | no | SSH username |
| sshPort | number | no | SSH port (positive integer) |
| sshKeyId | string | no | Reference to stored SSH key |
| createAgentKey | boolean | no | Generate agent API key |

**Response:**
```json
{
  "server": {
    "id": "uuid",
    "name": "New Server",
    "ip": "192.168.1.101",
    "vendor": "AWS",
    "specs": { ... },
    "sshUser": "ubuntu",
    "sshPort": 22,
    "sshKeyId": "uuid",
    "lastSeenAt": null,
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "apiKey": "32-byte-hex-string"
}
```

**Note:** The `apiKey` is only returned if `createAgentKey: true` and is shown **only once**.

---

#### Generate/Rotate Agent API Key

```
POST /admin/servers/:id/agent-key
Auth: none (currently - should be requireAdmin)
```

**Request:** Empty body

**Response:**
```json
{
  "serverId": "uuid",
  "apiKey": "32-byte-hex-string"
}
```

---

#### Update Server

```
PATCH /admin/servers/:id
Auth: none (currently - should be requireAdmin)
```

**Request:** (all fields optional)
```json
{
  "name": "Updated Server Name",
  "ip": "192.168.1.102",
  "vendor": "GCP",
  "specs": { ... },
  "sshUser": "admin",
  "sshPort": 2222,
  "sshKeyId": "uuid"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Updated Server Name",
  "ip": "192.168.1.102",
  "vendor": "GCP",
  "specs": { ... },
  "sshUser": "admin",
  "sshPort": 2222,
  "sshKeyId": "uuid",
  "lastSeenAt": "2024-01-15T10:30:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

#### Delete Server

```
DELETE /admin/servers/:id
Auth: none (currently - should be requireAdmin)
```

**Response:**
```json
{
  "ok": true
}
```

---

#### Probe Server via SSH

```
POST /admin/servers/:id/probe
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "passphrase": "optional-key-passphrase",
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "includeDocker": true,
  "timeoutMs": 30000
}
```

All fields are optional - will use stored SSH key if server has `sshKeyId` set.

**Response:**
```json
{
  "serverId": "uuid",
  "serverName": "Production Server",
  ...probe result data
}
```

---

#### Submit Agent Report

```
POST /agents/report
Auth: X-Agent-Key header
```

**Headers:**
```
X-Agent-Key: <32-byte-hex-api-key>
```

**Request:**
```json
{
  "serverName": "optional-server-name-update",
  "payload": {
    "system": {
      "cpu": {
        "load": 45.2
      },
      "mem": {
        "used": 5368709120,
        "total": 8589934592
      }
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| serverName | string | no | Update server name |
| payload | any | yes | Agent report data |

**Response:**
```json
{
  "ok": true
}
```

---

### Server Metrics

#### Get Server Metrics History

```
GET /servers/:id/metrics
Auth: none
```

**Query Parameters:**

| Parameter | Type | Default | Allowed Values | Description |
|-----------|------|---------|----------------|-------------|
| days | number | 1 | 1, 5, 15, 30 | Time range in days |
| stepMinutes | number | 60 | 5, 15, 30, 60 | Data point interval |

**Response:**
```json
{
  "serverId": "uuid",
  "generatedAt": "2024-01-15T10:30:00.000Z",
  "from": "2024-01-14T10:00:00.000Z",
  "to": "2024-01-15T10:00:00.000Z",
  "days": 1,
  "stepMinutes": 60,
  "points": [
    {
      "t": "2024-01-14T11:00:00.000Z",
      "cpuLoad": 45.2,
      "memUsedPct": 62.8,
      "samples": 12
    },
    {
      "t": "2024-01-14T12:00:00.000Z",
      "cpuLoad": null,
      "memUsedPct": null,
      "samples": 0
    }
  ]
}
```

**Notes:**
- `cpuLoad` and `memUsedPct` are `null` if no data for that interval
- `samples` indicates how many data points were aggregated
- Values are 0-100 percentages

---

#### Get Server Endpoints (Web Apps)

```
GET /servers/:id/endpoints
Auth: none
```

**Response:**
```json
{
  "serverId": "uuid",
  "endpoints": [
    {
      "id": "uuid",
      "name": "Main Website",
      "url": "https://example.com",
      "enabled": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastCheck": {
        "checkedAt": "2024-01-15T10:30:00.000Z",
        "ok": true,
        "httpStatus": 200,
        "responseTimeMs": 150,
        "error": null
      },
      "uptime24h": 0.998,
      "buckets": [true, true, null, false, true, ...]
    }
  ]
}
```

**Notes:**
- `uptime24h` is a decimal (0.998 = 99.8%), `null` if no checks
- `buckets` is 24 values for last 12h (30-min buckets): `true` = all ok, `false` = any failed, `null` = no data

---

### Server Alerting

#### Get Global Alert Settings

```
GET /settings/server-alerts
Auth: requireAdmin
```

**Response:**
```json
{
  "settings": {
    "id": "uuid",
    "cpuThresholdPct": 90,
    "cpuDurationMin": 5,
    "ramThresholdPct": 90,
    "ramDurationMin": 5,
    "offlineTimeoutMin": 3,
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Update Global Alert Settings

```
POST /settings/server-alerts
Auth: requireAdmin
```

**Request:** (all fields optional)
```json
{
  "cpuThresholdPct": 85,
  "cpuDurationMin": 10,
  "ramThresholdPct": 85,
  "ramDurationMin": 10,
  "offlineTimeoutMin": 5
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| cpuThresholdPct | number | 1-100 | CPU usage threshold |
| cpuDurationMin | number | 1-60 | Minutes above threshold before alert |
| ramThresholdPct | number | 1-100 | RAM usage threshold |
| ramDurationMin | number | 1-60 | Minutes above threshold before alert |
| offlineTimeoutMin | number | 1-60 | Minutes offline before alert |

**Response:** Same as GET response with updated values.

---

#### Get Per-Server Alert Config

```
GET /servers/:id/alert-config
Auth: requireAdmin
```

**Response:**
```json
{
  "alertingEnabled": true,
  "cpuThresholdPct": null,
  "cpuDurationMin": null,
  "ramThresholdPct": null,
  "ramDurationMin": null,
  "offlineTimeoutMin": null,
  "effectiveSettings": {
    "cpuThresholdPct": 90,
    "cpuDurationMin": 5,
    "ramThresholdPct": 90,
    "ramDurationMin": 5,
    "offlineTimeoutMin": 3
  }
}
```

**Note:** `null` values mean global defaults are used. `effectiveSettings` shows the actual values in effect.

---

#### Update Per-Server Alert Config

```
POST /servers/:id/alert-config
Auth: requireAdmin
```

**Request:** (all fields optional)
```json
{
  "alertingEnabled": true,
  "cpuThresholdPct": 95,
  "cpuDurationMin": 10,
  "ramThresholdPct": 95,
  "ramDurationMin": 10,
  "offlineTimeoutMin": 5
}
```

Set values to `null` to revert to global defaults.

**Response:** Same format as GET response.

---

### Alerts

#### List Alerts

```
GET /alerts
Auth: requireAuth
```

**Query Parameters:**

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| page | number | 1 | - | Page number |
| limit | number | 20 | max 100 | Items per page |
| status | string | "active" | active, resolved, all | Filter by status |
| serverId | string | - | UUID | Filter by server |
| type | string | - | cpu, ram, offline | Filter by alert type |

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "server": {
        "id": "uuid",
        "name": "Production Server"
      },
      "type": "cpu",
      "thresholdValue": 90,
      "actualValue": 95.5,
      "status": "active",
      "triggeredAt": "2024-01-15T10:30:00.000Z",
      "resolvedAt": null,
      "resolvedBy": null,
      "duration": 2700000,
      "lastNotifiedAt": "2024-01-15T10:30:00.000Z",
      "notificationCount": 3
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

**Note:** `duration` is in **milliseconds** (2700000 = 45 minutes).

---

#### Get Active Alert Count (Widget)

```
GET /alerts/count
Auth: requireAuth
```

**Response:**
```json
{
  "activeCount": 3,
  "byType": {
    "cpu": 1,
    "ram": 1,
    "offline": 1
  }
}
```

---

#### Get Alert Details

```
GET /alerts/:id
Auth: requireAuth
```

**Response:**
```json
{
  "id": "uuid",
  "server": {
    "id": "uuid",
    "name": "Production Server"
  },
  "type": "cpu",
  "thresholdValue": 90,
  "actualValue": 95.5,
  "status": "active",
  "triggeredAt": "2024-01-15T10:30:00.000Z",
  "resolvedAt": null,
  "resolvedBy": null,
  "duration": 2700000,
  "lastNotifiedAt": "2024-01-15T11:00:00.000Z",
  "notificationCount": 3
}
```

---

#### Resolve Alert

```
POST /alerts/:id/resolve
Auth: requireAuth
```

**Request:** Empty body

**Response:**
```json
{
  "ok": true
}
```

Or if already resolved:
```json
{
  "ok": true,
  "message": "already-resolved"
}
```

---

### Web Applications (Uptime)

#### List All Web Apps

```
GET /webapps
Auth: none
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Main Website",
    "url": "https://example.com",
    "enabled": true,
    "server": {
      "id": "uuid",
      "name": "Production Server"
    },
    "lastCheck": {
      "checkedAt": "2024-01-15T10:30:00.000Z",
      "ok": true,
      "httpStatus": 200,
      "responseTimeMs": 150,
      "error": null
    },
    "uptime24h": 0.998,
    "uptime7d": 0.995
  }
]
```

**Note:** `uptime24h` and `uptime7d` are decimals (0-1), `null` if no checks.

---

#### Get Web App Details

```
GET /webapps/:id
Auth: none
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Main Website",
  "url": "https://example.com",
  "enabled": true,
  "server": {
    "id": "uuid",
    "name": "Production Server",
    "lastSeenAt": "2024-01-15T10:30:00.000Z"
  },
  "lastCheck": {
    "checkedAt": "2024-01-15T10:30:00.000Z",
    "ok": true,
    "httpStatus": 200,
    "responseTimeMs": 150,
    "error": null
  },
  "latestReport": {
    "reportedAt": "2024-01-15T10:30:00.000Z",
    "payload": { ... }
  }
}
```

**Note:** `latestReport` is included if webapp has an associated server.

---

#### Get Web App Uptime History

```
GET /webapps/:id/uptime
Auth: none
```

**Query Parameters:**

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| range | string | "24h" | 24h, 7d, 30d | Time range |

**Response:**
```json
[
  {
    "checkedAt": "2024-01-15T10:30:00.000Z",
    "ok": true,
    "httpStatus": 200,
    "responseTimeMs": 150,
    "error": null
  },
  {
    "checkedAt": "2024-01-15T10:25:00.000Z",
    "ok": false,
    "httpStatus": 503,
    "responseTimeMs": null,
    "error": "Service Unavailable"
  }
]
```

**Note:** Returns up to 5000 results, ordered ascending by time.

---

#### Create Web App

```
POST /admin/webapps
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "name": "API Endpoint",
  "url": "https://api.example.com/health",
  "serverId": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Minimum 1 character |
| url | string | yes | URL (auto-normalized with http:// if missing) |
| serverId | string | no | Associated server UUID |

**Response:** Created webapp object.

---

### Shared Hosting

#### List Shared Hosting Accounts

```
GET /shared-hosting
Auth: none
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "cPanel Account 1",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "domainCount": 5,
    "issuesCount": 1
  }
]
```

**Note:** `issuesCount` counts enabled domains with SSL status "critical" or "warning".

---

#### Get Shared Hosting Details

```
GET /shared-hosting/:id
Auth: none
```

**Response:**
```json
{
  "id": "uuid",
  "name": "cPanel Account 1",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "domains": [
    {
      "id": "uuid",
      "domain": "example.com",
      "enabled": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "sslExpiresAt": "2024-06-15T00:00:00.000Z",
      "sslIssuer": "Let's Encrypt",
      "sslStatus": "ok",
      "sslLastChecked": "2024-01-15T10:00:00.000Z",
      "lastKnownIp": "192.168.1.100",
      "dnsLastChecked": "2024-01-15T10:00:00.000Z",
      "lastCheck": {
        "checkedAt": "2024-01-15T10:30:00.000Z",
        "httpOk": true,
        "httpStatus": 200,
        "responseTimeMs": 250,
        "httpError": null,
        "currentIp": "192.168.1.100",
        "ipChanged": false
      },
      "uptime24h": 0.999
    }
  ]
}
```

**SSL Status Values:**
- `ok` - Certificate is valid (>30 days until expiry)
- `warning` - Certificate expires within 30 days
- `critical` - Certificate expired or expires very soon
- `unknown` - SSL not checked yet

---

#### Get Domain Check History

```
GET /shared-hosting/:id/domains/:domainId/history
Auth: none
```

**Query Parameters:**

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| range | string | "24h" | 24h, 7d, 30d |

**Response:**
```json
[
  {
    "checkedAt": "2024-01-15T10:30:00.000Z",
    "httpOk": true,
    "httpStatus": 200,
    "responseTimeMs": 250,
    "httpError": null,
    "currentIp": "192.168.1.100",
    "ipChanged": false
  }
]
```

---

#### Create Shared Hosting Account

```
POST /admin/shared-hosting
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "name": "New cPanel Account"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "New cPanel Account",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

---

#### Update Shared Hosting Account

```
PATCH /admin/shared-hosting/:id
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "name": "Updated Account Name"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Updated Account Name",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

#### Delete Shared Hosting Account

```
DELETE /admin/shared-hosting/:id
Auth: none (currently - should be requireAdmin)
```

**Response:**
```json
{
  "ok": true
}
```

---

#### Add Domain to Shared Hosting

```
POST /admin/shared-hosting/:id/domains
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "domain": "newdomain.com"
}
```

**Note:** Domain is normalized: lowercased, protocol and paths removed.

**Response:**
```json
{
  "id": "uuid",
  "domain": "newdomain.com",
  "enabled": true,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

---

#### Update Domain

```
PATCH /admin/shared-hosting/:id/domains/:domainId
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "domain": "updated-domain.com",
  "enabled": false
}
```

**Response:**
```json
{
  "id": "uuid",
  "domain": "updated-domain.com",
  "enabled": false,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

#### Delete Domain

```
DELETE /admin/shared-hosting/:id/domains/:domainId
Auth: none (currently - should be requireAdmin)
```

**Response:**
```json
{
  "ok": true
}
```

---

### SSH Keys

#### List SSH Keys

```
GET /admin/ssh-keys
Auth: none (currently - should be requireAdmin)
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Production Key",
    "username": "root",
    "port": 22,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Note:** Private keys are never returned in API responses.

---

#### Create SSH Key

```
POST /admin/ssh-keys
Auth: none (currently - should be requireAdmin)
```

**Request:**
```json
{
  "name": "New SSH Key",
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
  "passphrase": "optional-passphrase",
  "username": "root",
  "port": 22
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Minimum 1 character |
| privateKey | string | yes | Full private key content |
| passphrase | string | no | Key passphrase if encrypted |
| username | string | no | Default SSH username |
| port | number | no | Default SSH port (positive integer) |

**Response:**
```json
{
  "id": "uuid",
  "name": "New SSH Key",
  "username": "root",
  "port": 22,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

---

#### Update SSH Key

```
PATCH /admin/ssh-keys/:id
Auth: none (currently - should be requireAdmin)
```

**Request:** (all fields optional)
```json
{
  "name": "Updated Key Name",
  "username": "admin",
  "port": 2222,
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "passphrase": "new-passphrase"
}
```

Set `passphrase` to `null` to clear it.

**Response:**
```json
{
  "id": "uuid",
  "name": "Updated Key Name",
  "username": "admin",
  "port": 2222,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### Settings

#### Get SMTP Settings

```
GET /settings/smtp
Auth: requireAdmin
```

**Response (not configured):**
```json
{
  "configured": false,
  "settings": null
}
```

**Response (configured):**
```json
{
  "configured": true,
  "settings": {
    "id": "uuid",
    "host": "smtp.mailgun.org",
    "port": 587,
    "secure": true,
    "username": "postmaster@mg.example.com",
    "hasPassword": true,
    "fromEmail": "alerts@example.com",
    "fromName": "Edge Monitor",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Save SMTP Settings

```
POST /settings/smtp
Auth: requireAdmin
```

**Request:**
```json
{
  "host": "smtp.mailgun.org",
  "port": 587,
  "secure": true,
  "username": "postmaster@mg.example.com",
  "password": "smtp-password",
  "fromEmail": "alerts@example.com",
  "fromName": "Edge Monitor"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| host | string | yes | SMTP server host |
| port | number | yes | SMTP port (1-65535) |
| secure | boolean | no | Use TLS (default: true) |
| username | string | no | SMTP username (nullable) |
| password | string | no | SMTP password (nullable, omit to keep existing) |
| fromEmail | string | yes | Valid email address |
| fromName | string | no | Sender display name (nullable) |

**Response:**
```json
{
  "settings": {
    "id": "uuid",
    "host": "smtp.mailgun.org",
    "port": 587,
    "secure": true,
    "username": "postmaster@mg.example.com",
    "hasPassword": true,
    "fromEmail": "alerts@example.com",
    "fromName": "Edge Monitor",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Test SMTP

```
POST /settings/smtp/test
Auth: requireAdmin
```

**Request:**
```json
{
  "testEmail": "test@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Test email would be sent to test@example.com",
  "note": "Email sending not yet implemented - SMTP settings saved successfully"
}
```

---

#### Delete SMTP Settings

```
DELETE /settings/smtp
Auth: requireAdmin
```

**Response:**
```json
{
  "ok": true
}
```

---

#### Get SMS Settings

```
GET /settings/sms
Auth: requireAdmin
```

**Response (not configured):**
```json
{
  "configured": false,
  "settings": null
}
```

**Response (configured):**
```json
{
  "configured": true,
  "settings": {
    "id": "uuid",
    "enabled": true,
    "senderName": "EdgeMon",
    "hasApiKey": true,
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Note:** `configured` is `true` only if apiKey is set.

---

#### Save SMS Settings

```
POST /settings/sms
Auth: requireAdmin
```

**Request:**
```json
{
  "enabled": true,
  "senderName": "EdgeMon",
  "apiKey": "your-sms-api-key"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| enabled | boolean | no | Enable SMS alerts (default: false) |
| senderName | string | no | SMS sender name (nullable) |
| apiKey | string | no | SMS provider API key (nullable, null clears it, omit to keep) |

**Response:**
```json
{
  "settings": {
    "id": "uuid",
    "enabled": true,
    "senderName": "EdgeMon",
    "hasApiKey": true,
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Get Alert Recipients

```
GET /settings/alerts/recipients
Auth: requireAdmin
```

**Response:**
```json
{
  "recipients": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "fullName": "John Admin",
        "email": "john@example.com"
      },
      "email": "john@example.com",
      "phone": "+1234567890",
      "method": "both",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

#### Create/Update Alert Recipient

```
POST /settings/alerts/recipients
Auth: requireAdmin
```

**Request:**
```json
{
  "userId": "uuid",
  "email": "alerts@example.com",
  "phone": "+1234567890",
  "method": "both"
}
```

| Field | Type | Required | Options |
|-------|------|----------|---------|
| userId | string | yes | User UUID |
| email | string | no | Email (required if method=email or both) |
| phone | string | no | Phone min 3 chars (required if method=sms or both) |
| method | string | no | none, email, sms, both (default: none) |

**Response:**
```json
{
  "recipient": {
    "id": "uuid",
    "user": {
      "id": "uuid",
      "fullName": "John Admin",
      "email": "john@example.com"
    },
    "email": "alerts@example.com",
    "phone": "+1234567890",
    "method": "both",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### Get Alert Templates

```
GET /settings/templates/alerts
Auth: requireAdmin
```

**Response:**
```json
{
  "templates": {
    "id": "uuid",
    "emailSubject": "Alert: {{name}} is DOWN",
    "emailBody": "Service is DOWN\n\nName: {{name}}\nURL: {{url}}\nTime: {{time}}\nHTTP: {{httpStatus}}\nError: {{error}}\n",
    "smsBody": "ALERT: {{name}} DOWN {{time}}",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Template Variables:**
- `{{name}}` - Service/webapp name
- `{{url}}` - Service URL
- `{{time}}` - Alert time
- `{{httpStatus}}` - HTTP status code
- `{{error}}` - Error message

---

#### Save Alert Templates

```
POST /settings/templates/alerts
Auth: requireAdmin
```

**Request:**
```json
{
  "emailSubject": "Alert: {{name}} is DOWN",
  "emailBody": "Service is DOWN\n\nName: {{name}}\nURL: {{url}}",
  "smsBody": "ALERT: {{name}} DOWN"
}
```

All fields required, minimum 1 character each.

**Response:** Same format as GET response.

---

#### Send Test Alert

```
POST /settings/alerts/test
Auth: requireAdmin
```

**Request:**
```json
{
  "email": "test@example.com",
  "phone": "+1234567890"
}
```

At least one of `email` or `phone` must be provided (both nullable).

**Response:**
```json
{
  "ok": true,
  "result": { ... }
}
```

---

### Dashboard

#### Get Dashboard Data

```
GET /dashboard
Auth: none
```

**Query Parameters:**

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| range | string | "24h" | 24h, 7d, 30d |

**Response:**
```json
{
  "generatedAt": "2024-01-15T10:30:00.000Z",
  "range": "24h",
  "servers": {
    "total": 10,
    "active": 8,
    "activeWindowSeconds": 300,
    "recent": [
      {
        "id": "uuid",
        "name": "Production",
        "vendor": "DigitalOcean",
        "lastSeenAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  },
  "webapps": {
    "total": 25,
    "up": 24,
    "down": 1,
    "unknown": 0,
    "items": [
      {
        "id": "uuid",
        "name": "Main Site",
        "url": "https://example.com",
        "enabled": true,
        "server": { "id": "uuid", "name": "Production" },
        "lastCheck": {
          "checkedAt": "2024-01-15T10:30:00.000Z",
          "ok": true,
          "httpStatus": 200,
          "responseTimeMs": 150,
          "error": null
        }
      }
    ]
  },
  "uptimeSeries": [
    {
      "bucketStart": "2024-01-15T10:00:00.000Z",
      "okPct": 0.98,
      "okCount": 49,
      "totalCount": 50
    }
  ],
  "recentFailures": [
    {
      "webAppId": "uuid",
      "webAppName": "API",
      "checkedAt": "2024-01-15T10:25:00.000Z",
      "httpStatus": 503,
      "responseTimeMs": null,
      "error": "Service Unavailable"
    }
  ]
}
```

**Notes:**
- `servers.recent` returns up to 20 most recent servers
- `uptimeSeries` bucket size varies: 15min (24h), 2hr (7d), 6hr (30d)
- `okPct` is decimal (0.98 = 98%), `null` if no checks in bucket
- `recentFailures` returns last 15 failed checks

---

## Error Handling

### Standard Error Response

All errors follow this format:

```json
{
  "error": "error-code",
  "message": "Human readable message"
}
```

Or simpler format:
```json
{
  "error": "error-code"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

### Common Error Codes

| Code | Description |
|------|-------------|
| `invalid-credentials` | Wrong email/password |
| `invalid-password` | Wrong current password |
| `setup-already-complete` | Setup already done |
| `email-exists` | Email already registered |
| `user-not-found` | User doesn't exist |
| `cannot-delete-self` | Can't delete own account |
| `cannot-delete-last-admin` | Must have at least one admin |
| `server-not-found` | Server doesn't exist |
| `webapp-not-found` | WebApp doesn't exist |
| `shared-hosting-not-found` | Shared hosting account not found |
| `domain-not-found` | Domain doesn't exist |
| `alert-not-found` | Alert doesn't exist |
| `smtp-not-configured` | SMTP settings not set |
| `missing-email-for-alerts` | Email required for email alerts |
| `missing-phone-for-alerts` | Phone required for SMS alerts |
| `missing-destination` | No email or phone provided |
| `invalid-agent-key` | Agent API key invalid |
| `missing-server-ip` | Server IP required for probe |
| `missing-private-key` | SSH key required |
| `missing-ssh-username` | SSH username required |
| `invalid-url` | URL format invalid |

---

## Real-time Updates (SSE)

### Server Event Stream

```
GET /servers/:id/stream
Auth: none
```

Connect via EventSource for real-time server updates.

**Events:**

1. **hello** - Connection established
```
event: hello
data: {"server":{"id":"uuid","name":"Server Name"},"now":"2024-01-15T10:30:00.000Z","pollSeconds":2}
```

2. **report** - New server metrics (polls every 2 seconds)
```
event: report
data: {"server":{"id":"uuid","name":"Server Name"},"reportedAt":"2024-01-15T10:30:00.000Z","payload":{...}}
```

3. **keepalive** - Comment to keep connection alive (every 15 seconds)
```
: keepalive 1705315800000
```

### iOS Implementation Example

```swift
import Foundation

class ServerStreamManager {
    private var task: URLSessionDataTask?

    func connect(serverId: String, baseURL: String) {
        let url = URL(string: "\(baseURL)/servers/\(serverId)/stream")!
        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        task = URLSession.shared.dataTask(with: request) { data, response, error in
            // Parse SSE events from data stream
        }
        task?.resume()
    }

    func disconnect() {
        task?.cancel()
    }
}
```

---

## iOS App Implementation Notes

### Token Storage

Store the session token securely in iOS Keychain:

```swift
import Security

class KeychainManager {
    private static let service = "com.yourapp.edgemonitoring"
    private static let tokenKey = "authToken"

    static func saveToken(_ token: String) throws {
        let data = token.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenKey,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed
        }
    }

    static func getToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenKey,
            kSecReturnData as String: true
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenKey
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum KeychainError: Error {
    case saveFailed
}
```

### Network Layer Example

```swift
import Foundation

enum APIError: Error {
    case unauthorized
    case forbidden
    case notFound
    case badRequest(String)
    case serverError(String)
    case decodingError
    case networkError(Error)
}

struct ErrorResponse: Decodable {
    let error: String
    let message: String?
}

actor APIClient {
    static let shared = APIClient()
    private let baseURL: String
    private let decoder: JSONDecoder

    init(baseURL: String = "https://your-api.com") {
        self.baseURL = baseURL
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Encodable? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.badRequest("Invalid URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if requiresAuth, let token = KeychainManager.getToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError("Invalid response")
        }

        switch httpResponse.statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw APIError.decodingError
            }
        case 400:
            let errorResp = try? decoder.decode(ErrorResponse.self, from: data)
            throw APIError.badRequest(errorResp?.message ?? errorResp?.error ?? "Bad request")
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        default:
            let errorResp = try? decoder.decode(ErrorResponse.self, from: data)
            throw APIError.serverError(errorResp?.message ?? "Unknown error")
        }
    }
}
```

### Date Parsing

All dates are in ISO 8601 format with milliseconds:

```swift
let decoder = JSONDecoder()
decoder.dateDecodingStrategy = .iso8601
```

### Uptime Values

Remember that uptime values are **decimals (0-1)**, not percentages:

```swift
// Convert to percentage for display
let uptime24h: Double? = 0.998
if let uptime = uptime24h {
    let percentage = uptime * 100 // 99.8%
    let display = String(format: "%.1f%%", percentage)
}
```

### Duration Values

Alert durations are in **milliseconds**:

```swift
// Convert to readable format
let durationMs: Int = 2700000
let minutes = durationMs / 60000
let hours = minutes / 60
let remainingMinutes = minutes % 60
let display = hours > 0 ? "\(hours)h \(remainingMinutes)m" : "\(minutes)m"
```

### Polling Recommendations

| Data Type | Recommended Interval |
|-----------|---------------------|
| Dashboard | 30 seconds |
| Server details | Use SSE stream |
| Alert count | 60 seconds |
| Metrics history | On demand |
| Server list | 30 seconds |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial API documentation |
| 1.0.1 | 2024-01 | Fixed response structures to match production |
