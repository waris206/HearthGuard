// Smoke test against a RUNNING HearthGuard server using the official MCP SDK client.
// Usage: npm run smoke            (defaults to http://127.0.0.1:8787/mcp)
//        MCP_URL=https://your-host/mcp npm run smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://127.0.0.1:8787/mcp";
const client = new Client({ name: "hearthguard-smoke", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(url));
await client.connect(transport);
console.log(`Connected to ${url}`);
console.log(`Negotiated protocol version: ${transport.protocolVersion}`);
console.log(`Server: ${JSON.stringify(client.getServerVersion())}`);

const { tools } = await client.listTools();
console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);

const call = async (name: string, args: Record<string, unknown>) => {
  const res: any = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(`${name} failed: ${res.content?.[0]?.text}`);
  return res.structuredContent;
};

const ctx = await call("get_home_context", { homeId: "home-a", scenarioId: "a-suspicious-front-door" });
console.log(`get_home_context: ${ctx.home.name}, ${ctx.devices.length} devices, occupancy ${ctx.activeScenario.occupancy.mode}`);
const inv = await call("investigate_events", { homeId: "home-a", scenarioId: "a-suspicious-front-door" });
console.log(`investigate_events: ${inv.incidentId} score ${inv.assessment.score} ${inv.assessment.classification}; rules ${inv.triggeredRules.map((r: any) => r.ruleId).join(",")}`);
const peer = await call("check_peer_intelligence", { incidentId: inv.incidentId });
console.log(`check_peer_intelligence: ${peer.matches.length} match(es), +${peer.scoreAdjustment}; ${peer.publishNote}`);
const prop = await call("prepare_response", { incidentId: inv.incidentId, decision: "propose" });
console.log(`prepare_response(propose): ${prop.status}, ${prop.proposal?.actions.length ?? 0} simulated action(s), recorded=${prop.recorded}`);
const cancel = await call("prepare_response", { incidentId: inv.incidentId, decision: "cancel", proposalId: prop.proposal.proposalId, confirmationCode: prop.proposal.confirmationCode });
console.log(`prepare_response(cancel): ${cancel.status}, recorded=${cancel.recorded}`);
await client.close();
console.log("SMOKE OK");
