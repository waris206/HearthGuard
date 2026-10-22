import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InvestigationAssistant } from "../src/assistant/assistant.js";
import { startTestServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => srv.close());

const listTools = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
const mcpHeaders = { "content-type": "application/json", accept: "application/json, text/event-stream" };

describe("browser-borne request protection", () => {
  it("rejects cross-origin MCP requests but allows same-origin, the dev UI and non-browser clients", async () => {
    const evil = await fetch(srv.mcpUrl, { method: "POST", headers: { ...mcpHeaders, origin: "https://evil.example" }, body: listTools });
    expect(evil.status).toBe(403);
    const same = await fetch(srv.mcpUrl, { method: "POST", headers: { ...mcpHeaders, origin: srv.base }, body: listTools });
    expect(same.status).toBe(200);
    const dev = await fetch(srv.mcpUrl, { method: "POST", headers: { ...mcpHeaders, origin: "http://localhost:5173" }, body: listTools });
    expect(dev.status).toBe(200);
    const cli = await fetch(srv.mcpUrl, { method: "POST", headers: mcpHeaders, body: listTools });
    expect(cli.status).toBe(200);
  });

  it("a cross-site form/text POST cannot reset demo data", async () => {
    const before = srv.service.listIncidents().length;
    srv.service.investigateEvents({ homeId: "home-a", scenarioId: "a-normal-evening" });
    const textPlain = await fetch(`${srv.base}/api/reset`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect(textPlain.status).toBe(415);
    const crossOrigin = await fetch(`${srv.base}/api/reset`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
    expect(crossOrigin.status).toBe(403);
    expect(srv.service.listIncidents().length).toBe(before + 1);
  });

  it("sends security headers and hides the framework", async () => {
    const res = await fetch(`${srv.base}/api/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("safe defaults", () => {
  it("refuses to bind to a public interface without an explicit host allowlist", () => {
    const serverDir = join(__dirname, "..");
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env: { ...process.env, HG_HOST: "0.0.0.0", PORT: "0", HG_PERSIST: "0", HG_ALLOWED_HOSTS: "" },
      encoding: "utf8",
      timeout: 20000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Refusing to bind to 0\.0\.0\.0/);
  });
});

describe("hostile and invalid input", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ name: "hostile", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(srv.mcpUrl)));
  });
  afterAll(async () => client.close());

  it("rejects prototype-style and oversized ids without side effects", async () => {
    const before = srv.service.listIncidents().length;
    const proto: any = await client.callTool({ name: "investigate_events", arguments: { homeId: "__proto__", scenarioId: "constructor" } });
    expect(proto.isError).toBe(true);
    expect(JSON.parse(proto.content[0].text).error.code).toBe("UNKNOWN_HOME");
    const big: any = await client.callTool({ name: "get_home_context", arguments: { homeId: "x".repeat(5000) } });
    expect(big.isError).toBe(true);
    const wrongType: any = await client.callTool({ name: "prepare_response", arguments: { incidentId: "INC-0001", decision: "confirm; drop table" } });
    expect(wrongType.isError).toBe(true);
    expect(srv.service.listIncidents().length).toBe(before);
  });

  it("rejects oversized chat messages", async () => {
    const start = await fetch(`${srv.base}/api/conversations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ homeId: "home-a", scenarioId: "a-normal-evening" }) });
    const { conversationId } = (await start.json()) as any;
    const res = await fetch(`${srv.base}/api/conversations/${conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "a".repeat(1001) }) });
    expect(res.status).toBe(400);
  });
});

describe("unavailable tools fail safely", () => {
  it("times out a hung MCP server instead of hanging, and fabricates nothing", async () => {
    const hung: Server = createServer(() => {
      /* never respond */
    });
    await new Promise<void>((r) => hung.listen(0, "127.0.0.1", r));
    const port = (hung.address() as AddressInfo).port;
    const assistant = new InvestigationAssistant(() => `http://127.0.0.1:${port}/mcp`, { toolTimeoutMs: 300 });
    const started = Date.now();
    const res = await assistant.start("home-a", "a-suspicious-front-door");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.steps[0]).toMatchObject({ tool: "get_home_context", ok: false });
    expect(res.reply).toMatch(/failed/);
    expect(res.state.context).toBeNull();
    hung.closeAllConnections();
    await new Promise((r) => hung.close(r));
  });
});

