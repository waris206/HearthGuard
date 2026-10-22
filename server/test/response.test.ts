import { describe, expect, it } from "vitest";
import { HearthGuardService, ToolError } from "../src/service/hearthguard.js";

function setup(scenarioId = "a-suspicious-front-door") {
  const svc = new HearthGuardService({ seed: false });
  const inv = svc.investigateEvents({ homeId: "home-a", scenarioId });
  return { svc, incidentId: inv.incidentId };
}
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ToolError).code;
  }
  return "NO_ERROR";
};

describe("human-confirmed simulated response", () => {
  it("propose records nothing and requires confirmation", () => {
    const { svc, incidentId } = setup();
    const res = svc.prepareResponse({ incidentId, decision: "propose" });
    expect(res.status).toBe("awaiting_confirmation");
    expect(res.recorded).toBe(false);
    expect(res.proposal!.actions.every((a) => a.simulated === true)).toBe(true);
    const inc = svc.getIncident(incidentId);
    expect(inc.proposals[0].status).toBe("pending");
    expect(inc.proposals[0].outcome).toBeUndefined();
    expect(inc.history.some((h) => h.kind.startsWith("response_"))).toBe(false);
  });

  it("cannot confirm without the matching proposal and confirmation code", () => {
    const { svc, incidentId } = setup();
    const { proposal } = svc.prepareResponse({ incidentId, decision: "propose" });
    expect(code(() => svc.prepareResponse({ incidentId, decision: "confirm", proposalId: "PRP-0001-9", confirmationCode: proposal!.confirmationCode }))).toBe("UNKNOWN_PROPOSAL");
    expect(code(() => svc.prepareResponse({ incidentId, decision: "confirm", proposalId: proposal!.proposalId, confirmationCode: "000000" }))).toBe("CONFIRMATION_MISMATCH");
    expect(svc.getIncident(incidentId).proposals[0].status).toBe("pending");
  });

  it("confirm records simulated outcome once; a second decision is rejected", () => {
    const { svc, incidentId } = setup();
    const { proposal } = svc.prepareResponse({ incidentId, decision: "propose" });
    const done = svc.prepareResponse({ incidentId, decision: "confirm", proposalId: proposal!.proposalId, confirmationCode: proposal!.confirmationCode });
    expect(done.status).toBe("confirmed");
    expect(done.recorded).toBe(true);
    expect(done.proposal!.outcome!.every((o) => o.startsWith("SIMULATED:"))).toBe(true);
    expect(code(() => svc.prepareResponse({ incidentId, decision: "cancel", proposalId: proposal!.proposalId, confirmationCode: proposal!.confirmationCode }))).toBe("PROPOSAL_NOT_PENDING");
  });

  it("cancel is recorded without any simulated action", () => {
    const { svc, incidentId } = setup();
    const { proposal } = svc.prepareResponse({ incidentId, decision: "propose" });
    const res = svc.prepareResponse({ incidentId, decision: "cancel", proposalId: proposal!.proposalId, confirmationCode: proposal!.confirmationCode });
    expect(res.status).toBe("cancelled");
    expect(res.proposal!.outcome).toEqual(["Cancelled by the user. No simulated action was recorded."]);
    expect(svc.getIncident(incidentId).history.at(-1)!.kind).toBe("response_cancelled");
  });

  it("new evidence supersedes a pending proposal so a stale one cannot be confirmed", () => {
    const { svc, incidentId } = setup();
    const { proposal } = svc.prepareResponse({ incidentId, decision: "propose" });
    svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door", incidentId, assumptions: { occupancy: "home" } });
    expect(code(() => svc.prepareResponse({ incidentId, decision: "confirm", proposalId: proposal!.proposalId, confirmationCode: proposal!.confirmationCode }))).toBe("PROPOSAL_SUPERSEDED");
  });

  it("no protective action is proposed when there is no concern", () => {
    const { svc, incidentId } = setup("a-normal-evening");
    const res = svc.prepareResponse({ incidentId, decision: "propose" });
    expect(res.status).toBe("not_needed");
    expect(res.proposal).toBeNull();
  });

  it("validates ids", () => {
    const svc = new HearthGuardService({ seed: false });
    expect(code(() => svc.investigateEvents({ homeId: "home-z", scenarioId: "x" }))).toBe("UNKNOWN_HOME");
    expect(code(() => svc.investigateEvents({ homeId: "home-a", scenarioId: "nope" }))).toBe("UNKNOWN_SCENARIO");
    expect(code(() => svc.checkPeerIntelligence({ incidentId: "INC-9999" }))).toBe("UNKNOWN_INCIDENT");
    const inv = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-normal-evening" });
    expect(code(() => svc.investigateEvents({ homeId: "home-b", scenarioId: "b-normal-morning", incidentId: inv.incidentId }))).toBe("INCIDENT_MISMATCH");
  });
});

describe("proportional response", () => {
  it("likely concern gets the protective set; inconclusive gets verification-first without disabling the keypad", () => {
    const sus = setup("a-suspicious-front-door");
    const p1 = sus.svc.prepareResponse({ incidentId: sus.incidentId, decision: "propose" }).proposal!;
    expect(p1.actions.map((a) => a.id)).toContain("lock.disable_keypad");
    expect(p1.proportionality).toMatch(/^Protective set/);

    const amb = setup("a-ambiguous-guest-code");
    const p2 = amb.svc.prepareResponse({ incidentId: amb.incidentId, decision: "propose" }).proposal!;
    expect(p2.actions.map((a) => a.id)).not.toContain("lock.disable_keypad");
    expect(p2.actions.map((a) => a.id)).toContain("access.suspend_guest_code");
    expect(p2.proportionality).toMatch(/^Verification-first/);
  });

  it("the what-if (owner home) proposal drops the disruptive keypad action", () => {
    const { svc, incidentId } = setup("a-suspicious-front-door");
    svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door", incidentId, assumptions: { occupancy: "home" } });
    const p = svc.prepareResponse({ incidentId, decision: "propose" }).proposal!;
    expect(p.actions.map((a) => a.id)).not.toContain("lock.disable_keypad");
    expect(p.actions.find((a) => a.id === "notify.household")!.label).toMatch(/verify/);
    // Next steps must agree with the proposal's proportionality.
    expect(svc.getIncident(incidentId).revisions.at(-1)!.assessment.recommendedNextSteps.join(" ")).not.toMatch(/disable keypad/i);
  });
});
