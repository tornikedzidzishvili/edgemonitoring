import "dotenv/config";
import { getEnv } from "./env.js";
import { collectSnapshot } from "./collect.js";
import { postReport } from "./report.js";

const env = getEnv();

async function tick() {
  // Catch ALL errors locally — collect failures (e.g. docker socket
  // permission glitch), network failures, and non-2xx API responses must
  // NOT bubble up. An unhandled rejection on `void tick()` would crash the
  // Node process; with `restart: unless-stopped` Docker would restart-loop
  // the container forever, swallowing the next ~30s of metrics on every
  // transient blip. Log and continue so the next interval retries.
  try {
    const payload = await collectSnapshot(env.DOCKER_SOCKET_PATH);
    await postReport({
      centralApiUrl: env.CENTRAL_API_URL,
      agentApiKey: env.AGENT_API_KEY,
      serverName: env.SERVER_NAME,
      payload
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent] report failed: ${msg}`);
  }
}

const intervalMs = env.REPORT_INTERVAL_SECONDS * 1000;

// fire immediately, then interval
void tick();
setInterval(() => {
  void tick();
}, intervalMs);
