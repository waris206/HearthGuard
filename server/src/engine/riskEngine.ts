// Deterministic, explainable behavioural rules. No ML and no LLM: every point of score
// is traceable to a named rule and the event ids that triggered it.
import type {
  Assessment,
  Assumptions,
  Classification,
  EngineResult,
  Home,
  HomeEvent,
  Mitigation,
  Presence,
  RiskLevel,
  RuleNotTriggered,
  Scenario,
  TriggeredRule,
  UncertaintyLevel,
} from "../domain/types.js";

export const RULES = {
  R1: { id: "HG-R1", name: "Repeated failed access", pattern: "ENTRY_REPEATED_FAILED_ACCESS" },
  R2: { id: "HG-R2", name: "Entry activity while nobody is home", pattern: null },
  R3: { id: "HG-R3", name: "Unrecognised device near an entry", pattern: "UNKNOWN_DEVICE_AT_ENTRY" },
  R4: { id: "HG-R4", name: "Door opened without unlock after failed attempts", pattern: "ENTRY_WITHOUT_UNLOCK_AFTER_FAILURES" },
  R5: { id: "HG-R5", name: "Camera coverage lost during activity", pattern: null },
  R6: { id: "HG-R6", name: "Guest credential used outside its schedule", pattern: null },
} as const;

export const THRESHOLDS = {
  failedAttempts: 3,
  failedWindowMin: 10,
  unknownDeviceProximityMin: 10,
  forcedEntryWindowMin: 15,
  authorizedSessionMin: 30,
  likelyConcernScore: 50,
  elevatedScore: 20,
} as const;

export const SCORE_NOTE =
  "Heuristic score from 0 to 100, built from fixed rule weights. It ranks how much the evidence warrants attention; it is not a calibrated probability of compromise.";

const MIN = 60_000;
const t = (e: HomeEvent) => Date.parse(e.ts);
export const localTime = (iso: string) => iso.slice(11, 16);

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Builds a function answering "was any household member home at time x?". */
function presenceResolver(scenario: Scenario, assumptions: Assumptions) {
  if (assumptions.occupancy) {
    const fixed = assumptions.occupancy;
    return (_x: number): Presence => fixed;
  }
  const changes = scenario.events
    .filter((e) => e.type === "presence.arrived" || e.type === "presence.departed")
    .map((e) => ({ at: t(e), memberId: e.memberId!, presence: (e.type === "presence.arrived" ? "home" : "away") as Presence }));
  return (x: number): Presence => {
    const state = new Map(scenario.occupancyAtStart.members.map((m) => [m.memberId, m.presence]));
    for (const c of changes) if (c.at <= x) state.set(c.memberId, c.presence);
    return [...state.values()].includes("home") ? "home" : "away";
  };
}

export function evaluate(home: Home, scenario: Scenario, assumptions: Assumptions = {}): EngineResult {
  const events = scenario.events;
  const device = (id: string) => home.devices.find((d) => d.id === id)!;
  const presenceAt = presenceResolver(scenario, assumptions);
  const codes = new Map(home.settings.accessCodes.map((c) => [c.label, c]));

  const triggered: TriggeredRule[] = [];
  const notTriggered: RuleNotTriggered[] = [];
  const mitigations: Mitigation[] = [];
  const facts: string[] = [];
  const uncertainty: { factor: string; weight: number }[] = [];
  const actorFingerprints = new Set<string>();

  // ---- Observed facts (no judgement) ----
  const occ = assumptions.occupancy
    ? `Occupancy ASSUMED "${assumptions.occupancy}" for the whole window (user hypothesis, overrides sensor presence).`
    : `Occupancy at ${localTime(scenario.window.start)}: ${scenario.occupancyAtStart.members
        .map((m) => `${home.members.find((x) => x.id === m.memberId)?.label ?? m.memberId} ${m.presence} since ${localTime(m.since)}`)
        .join(", ")}.`;
  facts.push(occ);
  facts.push(`${events.length} events recorded between ${localTime(scenario.window.start)} and ${localTime(scenario.window.end)}.`);
  for (const e of events.filter((x) => x.type === "presence.arrived" || x.type === "presence.departed")) {
    facts.push(`${localTime(e.ts)} ${e.summary}.`);
  }
  const persons = events.filter((e) => e.type === "camera.person_detected");
  if (persons.length) facts.push(`Camera person detections: ${persons.map((e) => localTime(e.ts)).join(", ")}.`);

  // ---- Authorized sessions: valid credential unlocks explain the activity that follows ----
  const authorizedUnlocks: { at: number; e: HomeEvent }[] = [];
  const outOfSchedule: HomeEvent[] = [];
  for (const e of events.filter((x) => x.type === "lock.unlocked")) {
    const code = e.codeLabel ? codes.get(e.codeLabel) : undefined;
    if (!code) continue;
    if (code.kind === "resident") {
      authorizedUnlocks.push({ at: t(e), e });
      facts.push(`${localTime(e.ts)} unlock used resident code "${code.label}".`);
    } else if (code.schedule) {
      const [from, to] = code.schedule.split("-").map(minutesOf);
      const m = minutesOf(localTime(e.ts));
      if (m >= from && m <= to) {
        authorizedUnlocks.push({ at: t(e), e });
        facts.push(`${localTime(e.ts)} guest code "${code.label}" used inside its ${code.schedule} schedule.`);
      } else {
        outOfSchedule.push(e);
        facts.push(`${localTime(e.ts)} guest code "${code.label}" used ${m > to ? m - to : from - m} min outside its ${code.schedule} schedule.`);
      }
    }
  }
  const isAuthorizedAt = (x: number) =>
    authorizedUnlocks.some((u) => x >= u.at && x - u.at <= THRESHOLDS.authorizedSessionMin * MIN);

  // ---- R1: repeated failed access (sliding window per lock) ----
  const failures = events.filter((e) => e.type === "lock.unlock_failed");
  let r1Cluster: HomeEvent[] = [];
  const byLock = new Map<string, HomeEvent[]>();
  for (const f of failures) byLock.set(f.deviceId, [...(byLock.get(f.deviceId) ?? []), f]);
  for (const list of byLock.values()) {
    for (let i = 0; i < list.length; i++) {
      const cluster = list.filter((x) => t(x) >= t(list[i]) && t(x) - t(list[i]) <= THRESHOLDS.failedWindowMin * MIN);
      if (cluster.length > r1Cluster.length) r1Cluster = cluster;
    }
  }
  // A single resident typo followed by a resident unlock is ordinary.
  const explainedByResident = (f: HomeEvent) =>
    authorizedUnlocks.some((u) => u.e.deviceId === f.deviceId && u.at > t(f) && u.at - t(f) <= 5 * MIN && codes.get(u.e.codeLabel!)?.kind === "resident");
  if (failures.length) facts.push(`${failures.length} incorrect keypad code(s): ${failures.map((f) => localTime(f.ts)).join(", ")}.`);
  if (r1Cluster.length >= THRESHOLDS.failedAttempts) {
    const n = r1Cluster.length;
    const weight = Math.min(30, 20 + 4 * (n - THRESHOLDS.failedAttempts));
    triggered.push({
      ruleId: RULES.R1.id,
      name: RULES.R1.name,
      weight,
      evidenceEventIds: r1Cluster.map((e) => e.id),
      explanation: `${n} incorrect codes on ${device(r1Cluster[0].deviceId).name} within ${Math.round((t(r1Cluster[n - 1]) - t(r1Cluster[0])) / MIN)} min (threshold: ${THRESHOLDS.failedAttempts} in ${THRESHOLDS.failedWindowMin} min).`,
      inference: "Consistent with someone guessing codes. A household member who forgot their code is the benign alternative.",
    });
  } else {
    const unexplained = failures.filter((f) => !explainedByResident(f));
    notTriggered.push({
      ruleId: RULES.R1.id,
      name: RULES.R1.name,
      reason: failures.length
        ? `${failures.length} failed attempt(s), below the threshold of ${THRESHOLDS.failedAttempts} in ${THRESHOLDS.failedWindowMin} min.`
        : "No failed access attempts.",
    });
    if (unexplained.length) {
      uncertainty.push({ factor: `${unexplained.length} failed attempt(s) below the alert threshold were not followed by a resident unlock.`, weight: 1 });
    } else if (failures.length) {
      facts.push("The failed attempt(s) were followed within 5 min by a resident-code unlock, consistent with a typo.");
    }
  }

  // ---- R2: entry activity while nobody home ----
  const isEntryActivity = (e: HomeEvent) =>
    (e.type === "contact.opened" && device(e.deviceId).entry) || e.type === "motion.detected" || e.type === "lock.unlocked";
  const entryActivity = events.filter(isEntryActivity);
  const awayActivity = entryActivity.filter((e) => presenceAt(t(e)) === "away" && !isAuthorizedAt(t(e)));
  if (awayActivity.length) {
    triggered.push({
      ruleId: RULES.R2.id,
      name: RULES.R2.name,
      weight: 15,
      evidenceEventIds: awayActivity.map((e) => e.id),
      explanation: `${awayActivity.length} door/indoor event(s) while no household member was present and no valid in-schedule credential explained them.`,
      inference: "Someone was at or inside the home without a known reason, unless presence data is wrong (e.g. a phone left at work).",
    });
  } else {
    notTriggered.push({
      ruleId: RULES.R2.id,
      name: RULES.R2.name,
      reason: entryActivity.length
        ? "All door/indoor activity happened while someone was home or right after a valid credential unlock."
        : "No door or indoor activity in the window.",
    });
  }

  // ---- R3: unknown device near entry-related activity ----
  const entryRelated = [...entryActivity, ...failures];
  const unknown = events.filter(
    (e) =>
      e.type === "network.unknown_device" &&
      entryRelated.some((x) => Math.abs(t(x) - t(e)) <= THRESHOLDS.unknownDeviceProximityMin * MIN),
  );
  if (unknown.length) {
    unknown.forEach((e) => e.actorFingerprint && actorFingerprints.add(e.actorFingerprint));
    triggered.push({
      ruleId: RULES.R3.id,
      name: RULES.R3.name,
      weight: 10,
      evidenceEventIds: unknown.map((e) => e.id),
      explanation: `An unrecognised radio device was seen ${unknown.length} time(s) within ${THRESHOLDS.unknownDeviceProximityMin} min of door activity. It is not on the household device list.`,
      inference: "The person at the door may have carried this device. A passer-by or neighbour's device is the benign alternative.",
    });
  } else {
    notTriggered.push({ ruleId: RULES.R3.id, name: RULES.R3.name, reason: "No unrecognised devices near door activity." });
  }

  // ---- R4: door opened without unlock shortly after failed attempts ----
  const r4: HomeEvent[] = [];
  let r4Blocked = false;
  if (r1Cluster.length >= THRESHOLDS.failedAttempts) {
    const lastFail = t(r1Cluster[r1Cluster.length - 1]);
    for (const e of events) {
      if (e.type !== "contact.opened" || !device(e.deviceId).entry) continue;
      if (t(e) <= lastFail || t(e) - lastFail > THRESHOLDS.forcedEntryWindowMin * MIN) continue;
      const unlockedBetween = events.some((u) => u.type === "lock.unlocked" && t(u) >= lastFail && t(u) <= t(e));
      if (unlockedBetween) continue;
      if (presenceAt(t(e)) === "home") {
        r4Blocked = true;
        continue;
      }
      r4.push(e);
    }
  }
  if (r4.length) {
    triggered.push({
      ruleId: RULES.R4.id,
      name: RULES.R4.name,
      weight: 25,
      evidenceEventIds: [r1Cluster[r1Cluster.length - 1].id, ...r4.map((e) => e.id)],
      explanation: `${r4.map((e) => device(e.deviceId).location).join(", ")} opened within ${THRESHOLDS.forcedEntryWindowMin} min of the last failed code, with no successful unlock in between and nobody home.`,
      inference: "This sequence is consistent with entry through another door. The sensor cannot tell who opened it.",
    });
  } else {
    notTriggered.push({
      ruleId: RULES.R4.id,
      name: RULES.R4.name,
      reason: r4Blocked
        ? "A door opened after the failed attempts, but someone was home, so opening it from inside is expected."
        : r1Cluster.length >= THRESHOLDS.failedAttempts
          ? "No door opened without an unlock after the failed attempts."
          : "Requires a repeated-failure cluster first (HG-R1).",
    });
  }

  // ---- R5: camera coverage lost ----
  const camLoss = events.filter((e) => e.type === "camera.offline" || e.type === "camera.clip_unavailable");
  if (camLoss.length) {
    triggered.push({
      ruleId: RULES.R5.id,
      name: RULES.R5.name,
      weight: 5,
      evidenceEventIds: camLoss.map((e) => e.id),
      explanation: `${camLoss.map((e) => e.summary).join("; ")}.`,
      inference: "Visual confirmation is unavailable for part of the window. Loss of coverage alone may be a fault, not tampering.",
    });
    uncertainty.push({ factor: "Camera footage is missing for part of the window, so the person cannot be visually verified.", weight: 1 });
  } else {
    notTriggered.push({ ruleId: RULES.R5.id, name: RULES.R5.name, reason: "Camera coverage stayed available." });
  }

  // ---- R6: guest credential outside schedule ----
  if (outOfSchedule.length) {
    triggered.push({
      ruleId: RULES.R6.id,
      name: RULES.R6.name,
      weight: 10,
      evidenceEventIds: outOfSchedule.map((e) => e.id),
      explanation: `Guest code ${outOfSchedule.map((e) => `"${e.codeLabel}" at ${localTime(e.ts)}`).join(", ")} was used outside its scheduled window.`,
      inference: "Either a late but legitimate visit or a shared or leaked code. The data cannot tell them apart.",
    });
    uncertainty.push({
      factor: "A valid household credential was used; a legitimate late visit and a shared or leaked code cannot be told apart from sensor data alone.",
      weight: 2,
    });
  } else {
    notTriggered.push({ ruleId: RULES.R6.id, name: RULES.R6.name, reason: "No guest code used outside its schedule." });
  }

  // ---- Mitigations ----
  const occupiedActivity = entryActivity.filter((e) => presenceAt(t(e)) === "home");
  if (occupiedActivity.length) {
    mitigations.push({
      id: "HG-M1",
      name: "Household member present",
      weight: -10,
      evidenceEventIds: assumptions.occupancy ? [] : occupiedActivity.map((e) => e.id),
      explanation: assumptions.occupancy
        ? "Under the assumption that someone was home, door and indoor activity is expected."
        : "A household member was present during the door and indoor activity.",
    });
  }

  if (assumptions.occupancy) {
    uncertainty.push({ factor: "The assessment uses a hypothetical occupancy assumption instead of recorded presence data.", weight: 1 });
  }
  if (triggered.length && actorFingerprints.size === 0 && triggered.some((r) => r.weight >= 10)) {
    uncertainty.push({ factor: "No device identifier was observed for the person involved, so the activity cannot be linked to other incidents.", weight: 1 });
  }

  const baseScore = clamp(triggered.reduce((s, r) => s + r.weight, 0) + mitigations.reduce((s, m) => s + m.weight, 0));
  const patternCodes = triggered
    .map((r) => Object.values(RULES).find((x) => x.id === r.ruleId)?.pattern)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return {
    observedFacts: facts,
    triggeredRules: triggered,
    mitigations,
    notTriggered,
    baseScore,
    uncertaintyFactors: uncertainty,
    actorFingerprints: [...actorFingerprints],
    patternCodes,
    ruleEvents: Object.fromEntries(triggered.map((r) => [r.ruleId, r.evidenceEventIds])),
  };
}

export function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function levelFor(score: number): RiskLevel {
  if (score >= THRESHOLDS.likelyConcernScore) return "high";
  if (score >= THRESHOLDS.elevatedScore) return "elevated";
  return "low";
}

/** Combine engine output and an optional peer-intelligence adjustment into a user-facing assessment. */
export function assess(engine: EngineResult, peerAdjustment = 0, peerFactor?: string): Assessment {
  const score = clamp(engine.baseScore + peerAdjustment);
  const factors = [...engine.uncertaintyFactors];
  if (peerFactor) factors.push({ factor: peerFactor, weight: 0 });
  const u = factors.reduce((s, f) => s + f.weight, 0);
  const uncertaintyLevel: UncertaintyLevel = u >= 3 ? "high" : u >= 1 ? "medium" : "low";
  const level = levelFor(score);

  let classification: Classification;
  if (score >= THRESHOLDS.likelyConcernScore && uncertaintyLevel !== "high") classification = "likely_security_concern";
  else if (score < THRESHOLDS.elevatedScore && uncertaintyLevel !== "high") classification = "no_concern";
  else classification = "inconclusive";

  const ids = new Set(engine.triggeredRules.map((r) => r.ruleId));
  const steps: string[] = [];
  if (classification === "no_concern") {
    steps.push("No action needed. The activity matches expected household behaviour.");
  } else {
    if (ids.has(RULES.R4.id) || ids.has(RULES.R2.id)) steps.push("Check on the home: contact household members to confirm nobody is inside.");
    if (ids.has(RULES.R1.id))
      steps.push(
        classification === "likely_security_concern"
          ? "Temporarily disable keypad entry and rotate access codes."
          : "Ask household members whether anyone mistyped the code; rotate codes if nobody did.",
      );
    if (ids.has(RULES.R3.id)) steps.push("Keep the unrecognised device flagged and watch for it returning.");
    if (ids.has(RULES.R5.id)) steps.push("Restore camera power and storage, then review any footage that was saved.");
    if (ids.has(RULES.R6.id)) steps.push("Ask the guest-code holder whether they visited late; suspend the guest code until confirmed.");
    if (classification === "likely_security_concern") steps.push("If anyone is unaccounted for inside the home, contact local emergency services. HearthGuard does not do this for you.");
  }

  const summary =
    classification === "likely_security_concern"
      ? `The evidence suggests a likely security concern: ${engine.triggeredRules.map((r) => r.name.toLowerCase()).join(", ")}.`
      : classification === "inconclusive"
        ? `The evidence is not enough for a confident conclusion. ${engine.triggeredRules.length ? `Signals present: ${engine.triggeredRules.map((r) => r.name.toLowerCase()).join(", ")}.` : ""}`.trim()
        : "No security concern found. The activity is consistent with normal household behaviour.";

  return {
    score,
    scoreNote: SCORE_NOTE,
    level,
    classification,
    uncertainty: { level: uncertaintyLevel, factors: factors.map((f) => f.factor) },
    summary,
    recommendedNextSteps: steps,
  };
}
