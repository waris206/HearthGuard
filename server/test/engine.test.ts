import { describe, expect, it } from "vitest";
import { getHome, getScenario } from "../src/domain/fixtures.js";
import { assess, evaluate, SCORE_NOTE } from "../src/engine/riskEngine.js";

const run = (homeId: string, scenarioId: string, assumptions = {}) => {
  const home = getHome(homeId)!;
  const engine = evaluate(home, getScenario(home, scenarioId)!, assumptions);
  return { engine, assessment: assess(engine) };
};
const ids = (e: { triggeredRules: { ruleId: string }[] }) => e.triggeredRules.map((r) => r.ruleId);

describe("risk engine scenarios", () => {
  it("normal: owner returns home -> no concern, nothing triggered", () => {
    const { engine, assessment } = run("home-a", "a-normal-evening");
    expect(ids(engine)).toEqual([]);
    expect(assessment.classification).toBe("no_concern");
    expect(assessment.score).toBe(0);
    expect(engine.observedFacts.join(" ")).toMatch(/consistent with a typo/);
  });

  it("suspicious: repeated failures + away + unknown device + back door -> likely concern with evidence", () => {
    const { engine, assessment } = run("home-a", "a-suspicious-front-door");
    expect(ids(engine)).toEqual(["HG-R1", "HG-R2", "HG-R3", "HG-R4", "HG-R5"]);
    const r1 = engine.triggeredRules.find((r) => r.ruleId === "HG-R1")!;
    expect(r1.evidenceEventIds).toEqual(["as-03", "as-04", "as-05", "as-06", "as-07"]);
    const r4 = engine.triggeredRules.find((r) => r.ruleId === "HG-R4")!;
    expect(r4.evidenceEventIds).toContain("as-09");
    expect(assessment.classification).toBe("likely_security_concern");
    expect(assessment.level).toBe("high");
    expect(engine.actorFingerprints).toEqual(["ble:5e:91:c2:aa:10:7f"]);
    expect(engine.patternCodes).toEqual(["ENTRY_REPEATED_FAILED_ACCESS", "UNKNOWN_DEVICE_AT_ENTRY", "ENTRY_WITHOUT_UNLOCK_AFTER_FAILURES"]);
  });

  it("ambiguous: guest code outside schedule + missing clip -> inconclusive with high uncertainty", () => {
    const { engine, assessment } = run("home-a", "a-ambiguous-guest-code");
    expect(ids(engine)).toEqual(["HG-R2", "HG-R5", "HG-R6"]);
    expect(engine.notTriggered.find((n) => n.ruleId === "HG-R1")!.reason).toMatch(/below the threshold/);
    expect(assessment.classification).toBe("inconclusive");
    expect(assessment.uncertainty.level).toBe("high");
    expect(assessment.uncertainty.factors.join(" ")).toMatch(/legitimate late visit/);
  });

  it("what-if: assuming the owner was home removes away-dependent rules and lowers the score", () => {
    const base = run("home-a", "a-suspicious-front-door");
    const whatIf = run("home-a", "a-suspicious-front-door", { occupancy: "home" });
    expect(ids(whatIf.engine)).toEqual(["HG-R1", "HG-R3", "HG-R5"]);
    expect(whatIf.engine.mitigations.map((m) => m.id)).toEqual(["HG-M1"]);
    expect(whatIf.assessment.score).toBeLessThan(base.assessment.score);
    expect(whatIf.assessment.classification).toBe("inconclusive");
    expect(whatIf.assessment.uncertainty.factors.join(" ")).toMatch(/hypothetical occupancy/);
  });

  it("is deterministic", () => {
    expect(run("home-a", "a-suspicious-front-door")).toEqual(run("home-a", "a-suspicious-front-door"));
  });

  it("never presents the score as a probability", () => {
    const { assessment } = run("home-a", "a-suspicious-front-door");
    expect(assessment.scoreNote).toBe(SCORE_NOTE);
    expect(assessment.scoreNote).toMatch(/not a calibrated probability/);
  });

  it("peer adjustment can move an inconclusive Home B incident over the concern threshold", () => {
    const { engine } = run("home-b", "b-followup-probe");
    expect(assess(engine).classification).toBe("inconclusive");
    expect(assess(engine, 15).classification).toBe("likely_security_concern");
  });
});
