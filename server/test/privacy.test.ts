import { describe, expect, it } from "vitest";
import { getHome } from "../src/domain/fixtures.js";
import { homeToken, PeerIntelStore, SHARED_FIELDS, SharedIndicatorSchema } from "../src/intel/peerIntel.js";
import { HearthGuardService } from "../src/service/hearthguard.js";

const homeA = getHome("home-a")!;
const suspicious = homeA.scenarios.find((s) => s.id === "a-suspicious-front-door")!;

/** Every raw value from Home A that must never cross the home boundary. */
function homeASecrets(): string[] {
  const s = new Set<string>([homeA.id, homeA.name]);
  for (const d of homeA.devices) [d.id, d.name].forEach((v) => s.add(v));
  for (const m of homeA.members) s.add(m.label);
  for (const c of homeA.settings.accessCodes) s.add(c.label);
  for (const sc of homeA.scenarios) {
    for (const e of sc.events) {
      s.add(e.id);
      s.add(e.ts);
      s.add(e.summary);
      if (e.actorFingerprint) s.add(e.actorFingerprint);
    }
    for (const m of sc.occupancyAtStart.members) s.add(m.since);
  }
  return [...s];
}

describe("cross-home privacy boundary", () => {
  it("shared indicators contain only the allowed fields", () => {
    const svc = new HearthGuardService();
    const inv = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    const peer = svc.checkPeerIntelligence({ incidentId: inv.incidentId });
    expect(peer.queried.length).toBeGreaterThan(0);
    for (const ind of svc.peerStore.all()) expect(Object.keys(ind).sort()).toEqual([...SHARED_FIELDS].sort());
  });

  it("Home B's view of the shared store contains no raw Home A data", () => {
    const svc = new HearthGuardService();
    const inv = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    svc.checkPeerIntelligence({ incidentId: inv.incidentId });

    const bInv = svc.investigateEvents({ homeId: "home-b", scenarioId: "b-followup-probe" });
    const bPeer = svc.checkPeerIntelligence({ incidentId: bInv.incidentId });
    const fromA = bPeer.matches.filter((m) => m.indicator.sourceHomeToken === homeToken("home-a"));
    expect(fromA.length).toBeGreaterThan(0);

    const visibleToB = JSON.stringify({ store: svc.peerStore.visibleTo("home-b"), matches: bPeer.matches });
    for (const secret of homeASecrets()) expect(visibleToB).not.toContain(secret);
    // No minute/second precision timestamps leak (only hour buckets like 2026-10-21T21:00Z).
    expect(visibleToB).not.toMatch(/T\d{2}:(?!00Z)\d{2}/);
    expect(visibleToB).not.toMatch(/occupancy|timeline|events|presence/i);
  });

  it("the store rejects anything beyond the compact indicator shape", () => {
    const store = new PeerIntelStore();
    const good = {
      schemaVersion: 1 as const,
      indicatorId: "ind_0123456789ab",
      sourceHomeToken: "home_0123456789",
      patternCode: "ENTRY_REPEATED_FAILED_ACCESS" as const,
      actorToken: null,
      severity: "high" as const,
      confidence: "medium" as const,
      observedHour: "2026-10-21T21:00Z",
    };
    expect(store.publish([good])).toBe(1);
    expect(() => store.publish([{ ...good, indicatorId: "ind_ba9876543210", timeline: suspicious.events } as never])).toThrow();
    expect(() => store.publish([{ ...good, actorToken: "ble:5e:91:c2:aa:10:7f" } as never])).toThrow();
    expect(() => SharedIndicatorSchema.parse({ ...good, observedHour: "2026-10-21T21:14:00Z" })).toThrow();
  });

  it("a home never sees its own indicators as peer matches", () => {
    const svc = new HearthGuardService();
    // The seed published Home B's prior incident; Home B must not match itself.
    expect(svc.peerStore.visibleTo("home-b")).toEqual([]);
    const bInv = svc.investigateEvents({ homeId: "home-b", scenarioId: "b-followup-probe" });
    expect(svc.checkPeerIntelligence({ incidentId: bInv.incidentId }).matches).toEqual([]);
  });

  it("hypothetical what-if revisions are never published", () => {
    const svc = new HearthGuardService({ seed: false });
    const inv = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door", assumptions: { occupancy: "away" } });
    const res = svc.checkPeerIntelligence({ incidentId: inv.incidentId });
    expect(res.publishedCount).toBe(0);
    expect(res.publishNote).toMatch(/hypothetical/);
    expect(svc.peerStore.all()).toEqual([]);
  });

  it("raw actor fingerprints are replaced by keyed tokens", () => {
    const svc = new HearthGuardService({ seed: false });
    const inv = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    const res = svc.checkPeerIntelligence({ incidentId: inv.incidentId });
    for (const q of res.queried) expect(q.actorToken).toMatch(/^act_[a-f0-9]{16}$/);
    expect(JSON.stringify(res.queried)).not.toContain("5e:91");
  });
});

describe("peer match wording", () => {
  it("explains matches as correlation, never as proof of compromise", () => {
    const svc = new HearthGuardService();
    const inv = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    const res = svc.checkPeerIntelligence({ incidentId: inv.incidentId });
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.interpretation).toMatch(/not proof of compromise/);
    for (const m of res.matches) expect(m.interpretation).toMatch(/does not prove|may be|no evidence/);
    expect(res.scoreAdjustment).toBeLessThanOrEqual(15);
    expect(res.updatedAssessment.uncertainty.factors.join(" ")).toMatch(/not people/);
  });
});

describe("before/after peer view", () => {
  it("reports the home's own assessment separately from the peer-adjusted one", () => {
    const svc = new HearthGuardService();
    const a = svc.investigateEvents({ homeId: "home-a", scenarioId: "a-suspicious-front-door" });
    svc.checkPeerIntelligence({ incidentId: a.incidentId });
    const b = svc.investigateEvents({ homeId: "home-b", scenarioId: "b-followup-probe" });
    const res = svc.checkPeerIntelligence({ incidentId: b.incidentId });
    expect(res.assessmentBeforePeer).toMatchObject({ score: 35, classification: "inconclusive" });
    expect(res.updatedAssessment).toMatchObject({ score: 50, classification: "likely_security_concern" });
    expect(res.updatedAssessment.score - res.assessmentBeforePeer.score).toBe(res.scoreAdjustment);
  });
});
