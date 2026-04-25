import { request } from "undici";
import type { AgentPayload } from "./collect.js";

export async function postReport(params: {
  centralApiUrl: string;
  agentApiKey: string;
  serverName: string;
  payload: AgentPayload;
}): Promise<void> {
  // IMPORTANT: do NOT use `new URL("/agents/report", centralApiUrl)`. A
  // leading-slash relative URL replaces the entire path component, so a base
  // like "https://monitoring.edge.ge/api" loses its "/api" prefix and the
  // request lands on the web container's nginx (which 405s on POST). Use plain
  // concatenation with a single trailing-slash normalisation step.
  const base = params.centralApiUrl.replace(/\/+$/, "");
  const url = `${base}/agents/report`;

  const res = await request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-key": params.agentApiKey
    },
    body: JSON.stringify({
      serverName: params.serverName,
      payload: params.payload
    })
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const text = await res.body.text().catch(() => "");
    throw new Error(`Central API responded ${res.statusCode}: ${text}`);
  }
}
