import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectIntents, InvestigationAssistant } from "../src/assistant/assistant.js";
import { startTestServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => srv.close());

const post = async (path: string, body: unknown) => {
  const r = await fetch(`${srv.base}/api${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
};

describe("intent detection", () => {
  it("parses the demo questions", () => {
    expect([...detectIntents("Investigate the repeated front-door activity while nobody was home. Does the evidence suggest a security concern, has another home seen a similar pattern, and what should I do?")].sort()).toEqual(
      ["investigate", "peer", "respond"],
    );
    expect(detectIntents("What if the owner was actually home?").has("whatif_home")).toBe(true);
    expect(detectIntents("What if nobody was home?").has("whatif_away")).toBe(true);
    expect(detectIntents("Go back to the recorded presence data.").has("whatif_reset")).toBe(true);
    expect(detectIntents("confirm").has("confirm")).toBe(true);
    expect(detectIntents("Why do you think that?").has("explain")).toBe(true);
  });
});

describe("investigation orchestrator (via REST -> MCP client -> MCP server)", () => {
  it("runs a full investigation, keeps context for a what-if, and records a confirmed response", async () => {
    const start = await post("/conversations", { homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    expect(start.status).toBe(200);
    expect(start.body.mcp.protocolVersion).toBe("2025-11-25");
    const id = start.body.conversationId;

    const t1 = await post(`/conversations/${id}/messages`, {
      text: "Investigate the repeated front-door activity while nobody was home. Does the evidence suggest a security concern, has another home seen a similar pattern, and what should I do?",
    });
    expect(t1.body.steps.map((s: any) => s.tool)).toEqual(["get_home_context", "investigate_events", "check_peer_intelligence", "prepare_response"]);
    expect(t1.body.steps.every((s: any) => s.ok)).toBe(true);
    const incidentId = t1.body.state.incidentId;
    // The reply is built from tool results, not invented.
    const inv = t1.body.steps[1].result;
    expect(t1.body.reply).toContain(incidentId);
    for (const r of inv.triggeredRules) expect(t1.body.reply).toContain(r.ruleId);
    expect(t1.body.state.proposal.status).toBe("pending");
    expect(t1.body.state.proposal.confirmationCode).toBeUndefined();
    expect(JSON.stringify(t1.body.steps)).not.toMatch(/"confirmationCode":"[a-f0-9]{6}"/);

    const t2 = await post(`/conversations/${id}/messages`, { text: "What if the owner was actually home?" });
    expect(t2.body.state.incidentId).toBe(incidentId);
    const inv2 = t2.body.steps.find((s: any) => s.tool === "investigate_events");
    expect(inv2.arguments).toMatchObject({ incidentId, assumptions: { occupancy: "home" } });
    expect(inv2.result.revision).toBe(2);
    expect(t2.body.reply).toMatch(/No longer triggered: HG-R2/);

    const stale = await post(`/conversations/${id}/decision`, { proposalId: t1.body.state.proposal.proposalId, decision: "confirm" });
    expect(stale.body.steps).toEqual([]);
    expect(stale.body.reply).toMatch(/nothing was recorded/);

    const pid = t2.body.state.proposal.proposalId;
    const done = await post(`/conversations/${id}/decision`, { proposalId: pid, decision: "confirm" });
    expect(done.body.steps[0]).toMatchObject({ tool: "prepare_response", ok: true });
    expect(done.body.state.proposal.status).toBe("confirmed");
    const incident = srv.service.getIncident(incidentId);
    expect(incident.revisions).toHaveLength(2);
    expect(incident.proposals.find((p) => p.proposalId === pid)!.status).toBe("confirmed");
  });

  it("normal scenario: skips peer check and proposes nothing", async () => {
    const start = await post("/conversations", { homeId: "home-a", scenarioId: "a-normal-evening" });
    const t = await post(`/conversations/${start.body.conversationId}/messages`, { text: "Investigate this window." });
    expect(t.body.steps.map((s: any) => s.tool)).toEqual(["get_home_context", "investigate_events"]);
    expect(t.body.reply).toMatch(/no security concern/);
  });

  it("cancel via text records a cancellation", async () => {
    const start = await post("/conversations", { homeId: "home-a", scenarioId: "a-ambiguous-guest-code" });
    const id = start.body.conversationId;
    const t = await post(`/conversations/${id}/messages`, { text: "Investigate and tell me what should I do" });
    expect(t.body.state.investigation.assessment.classification).toBe("inconclusive");
    expect(t.body.state.proposal.status).toBe("pending");
    const c = await post(`/conversations/${id}/messages`, { text: "cancel" });
    expect(c.body.state.proposal.status).toBe("cancelled");
  });

  it("does not fabricate results when the MCP endpoint is unreachable", async () => {
    const broken = new InvestigationAssistant(() => "http://127.0.0.1:1/mcp");
    const res = await broken.start("home-a", "a-suspicious-front-door");
    expect(res.steps[0]).toMatchObject({ tool: "get_home_context", ok: false });
    expect(res.reply).toMatch(/failed/);
    expect(res.state.context).toBeNull();
  });

  it("surfaces tool errors to the user", async () => {
    const start = await post("/conversations", { homeId: "home-q", scenarioId: "x" });
    expect(start.body.steps[0].error.code).toBe("UNKNOWN_HOME");
    expect(start.body.reply).toMatch(/UNKNOWN_HOME/);
  });

  it("validates REST input", async () => {
    const bad = await post("/conversations", { homeId: "home-a" });
    expect(bad.status).toBe(400);
  });
});
