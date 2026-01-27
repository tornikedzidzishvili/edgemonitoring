# Edge Monitoring

Monorepo with:
- `apps/api`: Central monitoring API + uptime scheduler + storage with secure authentication and 2FA
- `apps/web`: Dashboard UI (uptime cards, list, details + chart)
- `apps/agent`: Lightweight edge agent that reports Docker + system snapshots via API key

## Features

- 🔐 **Secure Authentication**: User authentication with password hashing and session management
- � **Passkeys (WebAuthn)**: Modern passwordless authentication using biometrics, security keys, or device authenticators
- 🔒 **Two-Factor Authentication (2FA)**: Optional TOTP-based 2FA for enhanced security
- 👤 **User Profile Management**: Update profile information, change password, and manage 2FA/passkey settings
- 📊 **Server Monitoring**: Track server health, metrics, and alerts
- 🌐 **Web Application Monitoring**: Monitor uptime and performance
- 🚨 **Alert System**: Email and SMS notifications for issues

## Prereqs
- Node.js 20+
- (Optional) Docker for local compose

## Quick start (local)
1) Install deps:

```bash
npm install
```

2) Configure API env:

```bash
copy apps\api\.env.example apps\api\.env
```

3) Init database:

```bash
npm run db:migrate -w @edge-monitoring/api
```

4) Run API + Web (two terminals):

```bash
npm run dev:api
npm run dev:web
```

Open:
- API: http://localhost:4000/health
- Web: http://localhost:5173

## Production (TLS + domain monitoring.edge.ge)

This repo includes a production compose file that terminates TLS at an nginx reverse-proxy and serves:
- `https://monitoring.edge.ge/` -> Web UI
- `https://monitoring.edge.ge/api/*` -> API

Prereqs on the server:
- DNS `A` record: `monitoring.edge.ge` -> your server public IP (e.g. `46.224.152.2`)
- Ports `80` and `443` open to the internet
- Docker + Docker Compose v2 installed

Steps (on the server):
1) Set the API encryption secret (required for stored SSH keys):

```bash
export SSH_KEY_MASTER_SECRET="<choose-a-long-random-secret>"
```

2) Boot the stack + obtain a Let's Encrypt certificate:

```bash
chmod +x scripts/install-ssl-monitoring-edge-ge.sh
CERTBOT_EMAIL="admin@edge.ge" ./scripts/install-ssl-monitoring-edge-ge.sh
```

3) Switch the proxy to HTTPS:
- In `docker-compose.prod.yml`, change the proxy config mount from `infra/proxy/nginx.http.conf` to `infra/proxy/nginx.https.conf`.
- Restart the proxy:

```bash
docker compose -f docker-compose.prod.yml up -d --no-deps proxy
```

Note: certificate renewals are not automated in this repo yet. You can rerun certbot periodically:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew --webroot -w /var/www/certbot
```

## Secure server setup (recommended)

Goal: deploy with a non-root user and SSH key-only access (using your `id_ed25519`).

Assumptions:
- Server OS is Ubuntu/Debian
- Docker CE is already installed
- Server IP is reachable (example: `46.224.152.2`)

### 1) Bootstrap (run once)
From Windows PowerShell on your machine:

```powershell
Set-Location -Path "D:\Projects\edge Monitoring"
./scripts/server-setup-windows.ps1 -HostIp 46.224.152.2 -Domain monitoring.edge.ge -DeployUser edge
```

This will:
- Create user `edge`
- Disable password SSH auth and disable root login
- Allow only `edge` via SSH
- Enable firewall for `22`, `80`, `443`

### 2) Deploy
SSH to the server as the deploy user:

```bash
ssh -i ~/.ssh/id_ed25519 edge@46.224.152.2
```

Then deploy:

```bash
cd /opt/edge-monitoring
SSH_KEY_MASTER_SECRET="<choose-a-long-random-secret>" \
CERTBOT_EMAIL="admin@edge.ge" \
./scripts/deploy-prod.sh
```

Security notes:
- Never copy private keys to the server.
- `SSH_KEY_MASTER_SECRET` must be kept private; rotating it requires re-encrypting stored SSH keys.

## GitHub Actions auto-deploy (push-to-prod)

This repo includes a workflow that deploys to your production server on every push to `main` via SSH.

### 1) Create GitHub Secrets
In your GitHub repo: Settings → Secrets and variables → Actions, add:
- `PROD_HOST` = `46.224.152.2`
- `PROD_USER` = `edge`
- `PROD_SSH_PRIVATE_KEY` = *a deploy key private key* (recommended: create a separate key, do **not** reuse your personal key)
- `PROD_SSH_PASSPHRASE` = deploy key passphrase (if your deploy key is encrypted)
- `PROD_SSH_PORT` = `22` (optional)
- `PROD_APP_DIR` = `/opt/edge-monitoring` (optional)
- `PROD_REPO_URL` = `https://github.com/tornikedzidzishvili/edgemonitoring.git` (optional)
- `SSH_KEY_MASTER_SECRET` = your production encryption secret (required)
- `CERTBOT_EMAIL` = email for Let's Encrypt (recommended)

Note: this repo is private; the workflow uploads the code to the server over SSH and does not require the server to `git clone` from GitHub.

### 2) Install the deploy public key on the server
Append the deploy key public key to:
- `/home/edge/.ssh/authorized_keys`

### 3) First deploy
Ensure you can deploy manually first:

```bash
ssh -i ~/.ssh/<deploy_key> edge@46.224.152.2
SSH_KEY_MASTER_SECRET="<secret>" CERTBOT_EMAIL="admin@edge.ge" /opt/edge-monitoring/scripts/deploy-prod.sh
```

### 4) Automatic deploys
Push to `main` and GitHub Actions will run [.github/workflows/deploy-prod.yml](.github/workflows/deploy-prod.yml).

## Database
The API uses SQLite via Prisma.

- Local dev DB file: `apps/api/dev.db`
- Docker Compose DB file: stored in the `api_data` volume (mounted to `/data/dev.db` in the container)

To create/apply schema locally (dev):

```bash
npm run db:migrate -w @edge-monitoring/api
```

## User Authentication & Security

### Initial Setup
When you first access the web UI, you'll be prompted to create an admin account. This account has full access to all features including:
- User management
- System settings
- Server and application monitoring
- Alert configuration

### User Profile Management
Access your profile by clicking on your name in the top right corner and selecting "My Profile". From here you can:
- Update your name, email, and phone number
- Change your password
- Enable/disable two-factor authentication (2FA)
- Add and manage passkeys for passwordless login

### Passkeys (WebAuthn)
Passkeys provide a modern, secure, and convenient way to sign in without passwords. They use biometric authentication (fingerprint, face recognition) or your device's security features.

#### Adding a Passkey:
1. Navigate to your profile page
2. Click on the "Passkeys" tab
3. Click "Add Passkey"
4. Follow your browser/device prompts to create the passkey (e.g., use Touch ID, Face ID, or Windows Hello)
5. Your passkey is now ready to use!

#### Using a Passkey to Sign In:
1. On the login page, click "Sign in with Passkey"
2. Your browser/device will prompt you to authenticate (fingerprint, face, etc.)
3. You'll be signed in immediately - no password needed!

#### Managing Passkeys:
- **Rename**: Click "Rename" to give your passkey a descriptive name (e.g., "MacBook Pro", "iPhone")
- **Delete**: Click "Delete" to remove a passkey from your account

**Benefits of Passkeys**:
- 🚀 Faster login - no typing required
- 🔐 More secure - immune to phishing and password breaches
- 📱 Works across devices if synced (via iCloud Keychain, Google Password Manager, etc.)
- ♿ More accessible - easier for users with disabilities

**Note**: You can use multiple passkeys on different devices (laptop, phone, tablet, etc.)

### Two-Factor Authentication (2FA)
2FA adds an extra layer of security to your account using Time-based One-Time Passwords (TOTP).

#### Enabling 2FA:
1. Navigate to your profile page
2. Click on the "Two-Factor Auth" tab
3. Click "Setup Two-Factor Authentication"
4. Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
   - Alternatively, you can manually enter the secret code shown
5. Enter the 6-digit code from your authenticator app
6. Click "Enable 2FA"

#### Using 2FA:
Once enabled, you'll need to:
1. Enter your email and password as usual
2. Enter the 6-digit code from your authenticator app
3. Click "Sign in"

#### Disabling 2FA:
To disable 2FA (requires both password and 2FA code):
1. Go to your profile → "Two-Factor Auth" tab
2. Enter your password
3. Enter your current 2FA code
4. Click "Disable 2FA"

**Important**: Keep your 2FA secret code safe! If you lose access to your authenticator app, you'll need to contact an admin to regain access to your account.

## Add a server
Create a "Server" record (inventory + SSH defaults). Agent API keys are optional.

```bash
curl -X POST http://localhost:4000/admin/servers \
	-H "content-type: application/json" \
	-d "{\"name\":\"hetzner-01\",\"ip\":\"10.0.0.12\",\"vendor\":\"hetzner\",\"sshUser\":\"root\",\"sshPort\":22,\"specs\":{\"cpu\":\"AMD EPYC\",\"ramGb\":16}}"
```

Response includes:
- `server.id` (use it when attaching webapps to that server)

### Optional: generate an agent API key
If you also want to run the edge agent on that server, create a server with `createAgentKey: true`:

```bash
curl -X POST http://localhost:4000/admin/servers \
	-H "content-type: application/json" \
	-d "{\"name\":\"hetzner-01\",\"createAgentKey\":true}"
```

Response includes an `apiKey` you can set as `AGENT_API_KEY` on the host.

### Update server inventory fields
You can update IP/vendor/specs/SSH defaults later:

```bash
curl -X PATCH http://localhost:4000/admin/servers/<SERVER_ID> \
	-H "content-type: application/json" \
	-d "{\"ip\":\"10.0.0.12\",\"vendor\":\"hetzner\",\"sshUser\":\"root\",\"sshPort\":22,\"specs\":{\"cpuCores\":8,\"ramGb\":16,\"os\":\"ubuntu\"}}"
```

### Live SSH probe (no key stored)
For ad-hoc realtime metrics (load/mem/swap/disk/net/diskstats + docker ps/stats), call:

```bash
curl -X POST http://localhost:4000/admin/servers/<SERVER_ID>/probe \
	-H "content-type: application/json" \
	-d "{\"privateKey\":\"-----BEGIN OPENSSH PRIVATE KEY-----\\n...\\n-----END OPENSSH PRIVATE KEY-----\\n\"}"
```

You can override target fields per request (if you don't want to store defaults on the Server):

```bash
curl -X POST http://localhost:4000/admin/servers/<SERVER_ID>/probe \
	-H "content-type: application/json" \
	-d "{\"host\":\"10.0.0.12\",\"username\":\"root\",\"port\":22,\"privateKey\":\"...\",\"includeDocker\":true,\"timeoutMs\":20000}"
```

## Store SSH keys (encrypted) and reuse
If you don't want to paste keys every time, store an SSH key once (encrypted at rest) and attach it to a server.

1) Configure the API encryption secret (required):
- Local dev: set `SSH_KEY_MASTER_SECRET` in `apps/api/.env`
- Docker compose: `docker-compose.yml` already includes `SSH_KEY_MASTER_SECRET`

2) Create an SSH key:

```bash
curl -X POST http://localhost:4000/admin/ssh-keys \
	-H "content-type: application/json" \
	-d "{\"name\":\"root-key\",\"username\":\"root\",\"port\":22,\"privateKey\":\"-----BEGIN OPENSSH PRIVATE KEY-----\\n...\\n-----END OPENSSH PRIVATE KEY-----\\n\"}"
```

3) Attach it to a server:

```bash
curl -X PATCH http://localhost:4000/admin/servers/<SERVER_ID> \
	-H "content-type: application/json" \
	-d "{\"sshKeyId\":\"<SSH_KEY_ID>\"}"
```

4) Probe without providing a key:

```bash
curl -X POST http://localhost:4000/admin/servers/<SERVER_ID>/probe \
	-H "content-type: application/json" \
	-d "{}"
```

## Add a webapp (by URL or IP)
Create a monitored webapp:

```bash
curl -X POST http://localhost:4000/admin/webapps \
	-H "content-type: application/json" \
	-d "{\"name\":\"My App\",\"url\":\"https://example.com\"}"
```

You can also add by IP/host + optional port (the API will normalize it to `http://...`):

```bash
curl -X POST http://localhost:4000/admin/webapps \
	-H "content-type: application/json" \
	-d "{\"name\":\"Admin UI\",\"url\":\"10.0.0.12:8080\"}"
```

To attach a webapp to a server (so the details page can show server resources), include `serverId`:

```bash
curl -X POST http://localhost:4000/admin/webapps \
	-H "content-type: application/json" \
	-d "{\"name\":\"Frontend\",\"url\":\"10.0.0.12\",\"serverId\":\"<SERVER_ID>\"}"
```

## Edge agent (on a server)
- Copy `apps/agent/.env.example` to `.env`
- Run:

```bash
npm run build -w @edge-monitoring/agent
npm start -w @edge-monitoring/agent
```

The agent needs access to the Docker socket (typically `/var/run/docker.sock`).

### Agent hookup (Docker host)
1) In the central API, create the server and copy the returned `apiKey`.
2) On the Docker host, set these env vars (see `apps/agent/.env.example`):
	 - `CENTRAL_API_URL` (e.g. `http://<monitoring-api-host>:4000`)
	 - `SERVER_NAME`
	 - `AGENT_API_KEY`

3) Run the agent (example):

```bash
cd apps/agent
cp .env.example .env
# edit .env values
npm install
npm run build
npm start
```

### Agent hookup (as a container)
Build on the host (or publish your own image) and run with Docker socket mounted:

```bash
docker run -d --name edge-monitoring-agent \
	--restart unless-stopped \
	-e CENTRAL_API_URL="http://<monitoring-api-host>:4000" \
	-e SERVER_NAME="hetzner-01" \
	-e AGENT_API_KEY="<AGENT_API_KEY>" \
	-e REPORT_INTERVAL_SECONDS=30 \
	-e DOCKER_SOCKET_PATH=/var/run/docker.sock \
	-v /var/run/docker.sock:/var/run/docker.sock \
	edgemonitoring-agent:latest
```

Once the agent is reporting, the Webapp Details page shows:
- Docker containers (names/images/state/ports)
- CPU load, memory usage, disk usage

## Uptime history
The API stores every check result in the database. The dashboard uses:
- `uptime24h` and `uptime7d` computed from stored results
- Details page chart from `/webapps/:id/uptime?range=24h|7d|30d`
