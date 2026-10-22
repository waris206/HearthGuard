import { join } from "node:path";
import { createApp } from "./app.js";
import { InvestigationAssistant } from "./assistant/assistant.js";
import { HearthGuardService } from "./service/hearthguard.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HG_HOST ?? "127.0.0.1";
const extraHosts = process.env.HG_ALLOWED_HOSTS?.split(",").map((s) => s.trim()).filter(Boolean);
// The in-process assistant calls the MCP endpoint via 127.0.0.1, so keep loopback allowed.
const allowedHosts = extraHosts?.length ? [...extraHosts, "127.0.0.1", "localhost"] : undefined;
const persistFile = process.env.HG_PERSIST === "0" ? undefined : (process.env.HG_STATE_FILE ?? join(process.cwd(), ".runtime", "state.json"));

const service = new HearthGuardService({ persistFile });
const assistant = new InvestigationAssistant(() => `http://127.0.0.1:${port}/mcp`);
const app = createApp({ service, assistant, host, allowedHosts });

app.listen(port, host, () => {
  console.log(`HearthGuard listening on http://${host}:${port}`);
  console.log(`  MCP (Streamable HTTP): POST http://${host}:${port}/mcp`);
  console.log(`  UI/API:                http://${host}:${port}/  (API under /api)`);
  console.log(`  State file:            ${persistFile ?? "(in-memory only)"}`);
});
