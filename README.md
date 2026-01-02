# Edge Monitoring

Monorepo with:
- `apps/api`: Central monitoring API + uptime scheduler + storage
- `apps/web`: Dashboard UI (uptime cards, list, details + chart)
- `apps/agent`: Lightweight edge agent that reports Docker + system snapshots via API key

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

## Database
The API uses SQLite via Prisma.

- Local dev DB file: `apps/api/dev.db`
- Docker Compose DB file: stored in the `api_data` volume (mounted to `/data/dev.db` in the container)

To create/apply schema locally (dev):

```bash
npm run db:migrate -w @edge-monitoring/api
```

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
