import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startTestServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startTestServer>>;
let client: Client;
let transport: StreamableHTTPClientTransport;

beforeAll(async () => {
  srv = await startTestServer();
  client = new Client({ name: "hearthguard-test-client", version: "0.0.0" });
  transport = new StreamableHTTPClientTransport(new URL(srv.mcpUrl));
  await client.connect(transport);
});
afterAll(async () => {
  await client.close();
  await srv.close();
});

const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const errorOf = (res: any) => JSON.parse(res.content[0].text).error;

describe("MCP over Streamable HTTP (real SDK client)", () => {
  it("negotiates protocol version 2025-11-25", () => {
    expect(transport.protocolVersion).toBe("2025-11-25");
    expect(client.getServerVersion()).toMatchObject({ name: "hearthguard" });
  });

  it("lists exactly the four tools with input and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_peer_intelligence", "get_home_context", "investigate_events", "prepare_response"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.outputSchema?.type).toBe("object");
      expect(t.description!.length).toBeGreaterThan(40);
    }
  });

  it("runs the full workflow with real tool calls and structured results", async () => {
    const ctx: any = await call("get_home_context", { homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    expect(ctx.isError).toBeFalsy();
    expect(ctx.structuredContent.home.synthetic).toBe(true);
    expect(ctx.structuredContent.activeScenario.occupancy.mode).toBe("away");

    const inv: any = await call("investigate_events", { homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    const incidentId = inv.structuredContent.incidentId;
    expect(inv.structuredContent.assessment.classification).toBe("likely_security_concern");
    expect(inv.structuredContent.timeline.find((e: any) => e.id === "as-09").ruleIds).toContain("HG-R4");

    const peer: any = await call("check_peer_intelligence", { incidentId });
    expect(peer.structuredContent.matches.length).toBeGreaterThan(0);
    expect(peer.structuredContent.withheldFields.length).toBeGreaterThan(3);

    const prop: any = await call("prepare_response", { incidentId, decision: "propose" });
    expect(prop.structuredContent.status).toBe("awaiting_confirmation");
    const { proposalId, confirmationCode } = prop.structuredContent.proposal;

    const noCode: any = await call("prepare_response", { incidentId, decision: "confirm", proposalId });
    expect(noCode.isError).toBe(true);
    expect(errorOf(noCode).code).toBe("INVALID_INPUT");

    const done: any = await call("prepare_response", { incidentId, decision: "confirm", proposalId, confirmationCode });
    expect(done.structuredContent).toMatchObject({ status: "confirmed", recorded: true, simulated: true });
    expect(srv.service.getIncident(incidentId).history.at(-1)!.kind).toBe("response_confirmed");
  });

  it("supports what-if revisions on the same incident", async () => {
    const a: any = await call("investigate_events", { homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    const b: any = await call("investigate_events", {
      homeId: "home-a",
      scenarioId: "a-suspicious-front-door",
      incidentId: a.structuredContent.incidentId,
      assumptions: { occupancy: "home" },
    });
    expect(b.structuredContent.revision).toBe(2);
    expect(b.structuredContent.changes.rulesRemoved).toEqual(["HG-R2", "HG-R4"]);
  });

  it("returns meaningful errors for invalid input", async () => {
    const unknown: any = await call("get_home_context", { homeId: "home-z" });
    expect(unknown.isError).toBe(true);
    expect(errorOf(unknown).code).toBe("UNKNOWN_HOME");

    const badId: any = await call("check_peer_intelligence", { incidentId: "not-an-id" });
    expect(badId.isError).toBe(true);
    expect(badId.content[0].text).toMatch(/validation/i);

    const extra: any = await call("investigate_events", { homeId: "home-a", scenarioId: "a-normal-evening", assumptions: { occupancy: "home", injected: 1 } });
    expect(extra.isError).toBe(true);
  });

  it("rejects GET on the stateless endpoint and foreign Host headers", async () => {
    const get = await fetch(srv.mcpUrl, { headers: { accept: "text/event-stream" } });
    expect(get.status).toBe(405);
    // fetch() cannot override Host, so use node:http to simulate a DNS-rebinding request.
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(srv.mcpUrl);
      const req = request(
        { hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { host: "evil.example", "content-type": "application/json", accept: "application/json, text/event-stream" } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    });
    expect(status).toBe(403);
  });
});
