import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { InvestigationAssistant } from "../src/assistant/assistant.js";
import { HearthGuardService } from "../src/service/hearthguard.js";

export async function startTestServer() {
  const service = new HearthGuardService();
  let port = 0;
  const assistant = new InvestigationAssistant(() => `http://127.0.0.1:${port}/mcp`);
  const app = createApp({ service, assistant, webDist: "/nonexistent" });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    service,
    assistant,
    base,
    mcpUrl: `${base}/mcp`,
    async close() {
      await assistant.close();
      await new Promise((r) => server.close(r));
    },
  };
}
