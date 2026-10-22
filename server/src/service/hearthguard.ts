// Application service behind the four MCP tools. Holds the local incident history and the
// shared peer-intelligence store. Every protective action here is SIMULATED.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getHome, getScenario, listHomes } from "../domain/fixtures.js";
import type {
  Assessment,
  Assumptions,
  EngineResult,
  Home,
  Incident,
  ResponseAction,
  ResponseProposal,
  Scenario,
  SharedIndicator,
} from "../domain/types.js";
import { assess, evaluate, localTime, RULES } from "../engine/riskEngine.js";
import {
  deriveIndicators,
  LIMITATIONS,
  matchIndicators,
  PeerIntelStore,
  peerAdjustment,
  SHARED_FIELDS,
  WITHHELD_FIELDS,
} from "../intel/peerIntel.js";

export class ToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const nowIso = () => new Date().toISOString();

export interface ServiceOptions {
  /** Optional JSON file to persist incident history and the shared store across restarts. */
  persistFile?: string;
  /** Seed the shared store from Home B's prior incident (default true). */
  seed?: boolean;
}

export class HearthGuardService {
  private incidents = new Map<string, Incident>();
  private counter = 0;
  readonly peerStore = new PeerIntelStore();

  constructor(private readonly opts: ServiceOptions = {}) {
    if (!this.load()) this.reset();
  }

  // ---------- lifecycle ----------

  reset(): void {
    this.incidents.clear();
    this.counter = 0;
    this.peerStore.clear();
    if (this.opts.seed !== false) {
      // Seed the shared store by actually running Home B's prior incident through the
      // engine and publishing its derived indicators. Nothing is hand-written.
      const inv = this.investigateEvents({ homeId: "home-b", scenarioId: "b-prior-probe" });
      this.checkPeerIntelligence({ incidentId: inv.incidentId, publish: true });
      this.incidents.get(inv.incidentId)!.history.push({ at: nowIso(), kind: "seed", detail: "Investigated automatically at startup to seed the shared indicator store." });
    }
    this.save();
  }

  private load(): boolean {
    const f = this.opts.persistFile;
    if (!f || !existsSync(f)) return false;
    try {
      const data = JSON.parse(readFileSync(f, "utf8"));
      this.counter = data.counter;
      for (const i of data.incidents as Incident[]) this.incidents.set(i.incidentId, i);
      this.peerStore.publish(data.indicators as SharedIndicator[]);
      return true;
    } catch {
      return false;
    }
  }

  private save(): void {
    const f = this.opts.persistFile;
    if (!f) return;
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify({ counter: this.counter, incidents: [...this.incidents.values()], indicators: this.peerStore.all() }, null, 2));
  }

  // ---------- helpers ----------

  private home(homeId: string): Home {
    const h = getHome(homeId);
    if (!h) throw new ToolError("UNKNOWN_HOME", `Unknown homeId "${homeId}". Known: ${listHomes().map((x) => x.id).join(", ")}.`);
    return h;
  }

  private scenario(home: Home, scenarioId: string): Scenario {
    const s = getScenario(home, scenarioId);
    if (!s) throw new ToolError("UNKNOWN_SCENARIO", `Unknown scenarioId "${scenarioId}" for ${home.id}. Known: ${home.scenarios.map((x) => x.id).join(", ")}.`);
    return s;
  }

  private incident(incidentId: string): Incident {
    const i = this.incidents.get(incidentId);
    if (!i) throw new ToolError("UNKNOWN_INCIDENT", `Unknown incidentId "${incidentId}". Run investigate_events first.`);
    return i;
  }

  private latest(i: Incident) {
    return i.revisions[i.revisions.length - 1];
  }

  /** Time of the earliest evidence event, used for the indicator's hour bucket. */
  private observedAt(engine: EngineResult, scenario: Scenario): string {
    const ids = new Set(engine.triggeredRules.flatMap((r) => r.evidenceEventIds));
    return scenario.events.find((e) => ids.has(e.id))?.ts ?? scenario.window.start;
  }

  private indicatorsFor(i: Incident): SharedIndicator[] {
    const home = this.home(i.homeId);
    const sc = this.scenario(home, i.scenarioId);
    const rev = this.latest(i);
    return deriveIndicators(i.homeId, rev.engine, this.observedAt(rev.engine, sc), rev.engine.baseScore, assess(rev.engine).uncertainty.level);
  }

  listIncidents(): Incident[] {
    return [...this.incidents.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getIncident(incidentId: string): Incident {
    return this.incident(incidentId);
  }

  // ---------- tool 1: get_home_context ----------

  getHomeContext(input: { homeId: string; scenarioId?: string }) {
    const home = this.home(input.homeId);
    const sc = input.scenarioId ? this.scenario(home, input.scenarioId) : undefined;
    return {
      home: { id: home.id, name: home.name, timezone: home.timezone, synthetic: true as const },
      members: home.members.map((m) => ({ id: m.id, label: m.label, role: m.role })),
      devices: home.devices.map((d) => ({ id: d.id, name: d.name, kind: d.kind, location: d.location, entry: d.entry, status: d.status })),
      settings: {
        awayModeEnabled: home.settings.awayModeEnabled,
        shareIndicators: home.settings.shareIndicators,
        notifyMembers: home.settings.notifyMembers,
        // Labels and schedules only; no code values exist in the fixtures.
        accessCodes: home.settings.accessCodes.map((c) => ({ label: c.label, kind: c.kind, schedule: c.schedule ?? null })),
      },
      scenarios: home.scenarios.map((s) => ({ id: s.id, title: s.title, description: s.description, window: s.window })),
      activeScenario: sc
        ? {
            id: sc.id,
            title: sc.title,
            window: sc.window,
            occupancy: {
              mode: sc.occupancyAtStart.mode,
              members: sc.occupancyAtStart.members.map((m) => ({ ...m, label: home.members.find((x) => x.id === m.memberId)?.label ?? m.memberId })),
            },
            eventCount: sc.events.length,
          }
        : null,
      incidents: this.listIncidents()
        .filter((i) => i.homeId === home.id)
        .map((i) => ({ incidentId: i.incidentId, scenarioId: i.scenarioId, title: i.title, classification: this.latest(i).assessment.classification, updatedAt: i.updatedAt })),
    };
  }

  // ---------- tool 2: investigate_events ----------

  investigateEvents(input: { homeId: string; scenarioId: string; incidentId?: string; assumptions?: Assumptions }) {
    const home = this.home(input.homeId);
    const sc = this.scenario(home, input.scenarioId);
    const assumptions: Assumptions = input.assumptions ?? {};
    let incident: Incident;
    if (input.incidentId) {
      incident = this.incident(input.incidentId);
      if (incident.homeId !== home.id || incident.scenarioId !== sc.id) {
        throw new ToolError("INCIDENT_MISMATCH", `Incident ${incident.incidentId} belongs to ${incident.homeId}/${incident.scenarioId}, not ${home.id}/${sc.id}.`);
      }
    } else {
      this.counter += 1;
      const at = nowIso();
      incident = {
        incidentId: `INC-${String(this.counter).padStart(4, "0")}`,
        homeId: home.id,
        scenarioId: sc.id,
        title: sc.title,
        createdAt: at,
        updatedAt: at,
        revisions: [],
        peer: null,
        proposals: [],
        history: [],
      };
      this.incidents.set(incident.incidentId, incident);
    }

    const previous = incident.revisions.length ? this.latest(incident) : null;
    const engine = evaluate(home, sc, assumptions);
    // Re-apply any earlier peer check against the new evidence (no new publishing here).
    let adj = 0;
    let peerFactor: string | undefined;
    if (incident.peer) {
      const local = deriveIndicators(home.id, engine, this.observedAt(engine, sc), engine.baseScore, assess(engine).uncertainty.level);
      const matches = matchIndicators(home.id, local, this.peerStore);
      adj = peerAdjustment(matches);
      peerFactor = peerUncertainty(matches.length);
    }
    const assessment = assess(engine, adj, peerFactor);
    const revision = { revision: incident.revisions.length + 1, at: nowIso(), assumptions, engine, assessment };
    incident.revisions.push(revision);
    incident.updatedAt = revision.at;
    for (const p of incident.proposals) if (p.status === "pending") p.status = "superseded";
    incident.history.push({
      at: revision.at,
      kind: "investigation",
      detail: `Revision ${revision.revision}${assumptions.occupancy ? ` (assuming occupancy "${assumptions.occupancy}")` : ""}: ${assessment.classification}, score ${assessment.score}.`,
    });
    this.save();

    const ruleByEvent = new Map<string, string[]>();
    for (const r of engine.triggeredRules) for (const id of r.evidenceEventIds) ruleByEvent.set(id, [...(ruleByEvent.get(id) ?? []), r.ruleId]);
    const device = (id: string) => home.devices.find((d) => d.id === id)!;

    return {
      incidentId: incident.incidentId,
      revision: revision.revision,
      home: { id: home.id, name: home.name },
      scenario: { id: sc.id, title: sc.title, window: sc.window },
      assumptions,
      timeline: sc.events.map((e) => ({
        id: e.id,
        ts: e.ts,
        localTime: localTime(e.ts),
        deviceId: e.deviceId,
        device: device(e.deviceId).name,
        location: device(e.deviceId).location,
        type: e.type,
        summary: e.summary,
        ruleIds: ruleByEvent.get(e.id) ?? [],
      })),
      observedFacts: engine.observedFacts,
      triggeredRules: engine.triggeredRules,
      mitigations: engine.mitigations,
      notTriggered: engine.notTriggered,
      assessment,
      shareablePatternCodes: engine.patternCodes,
      changes: previous ? diffRevisions(previous.assessment, assessment, previous.engine.triggeredRules.map((r) => r.ruleId), engine.triggeredRules.map((r) => r.ruleId)) : null,
    };
  }

  // ---------- tool 3: check_peer_intelligence ----------

  checkPeerIntelligence(input: { incidentId: string; publish?: boolean }) {
    const incident = this.incident(input.incidentId);
    const home = this.home(incident.homeId);
    const rev = this.latest(incident);
    const local = this.indicatorsFor(incident);
    const matches = matchIndicators(home.id, local, this.peerStore);

    const hypothetical = Boolean(rev.assumptions.occupancy);
    let publishedCount = 0;
    let publishNote: string;
    if (input.publish === false) publishNote = "Publishing was not requested.";
    else if (!home.settings.shareIndicators) publishNote = "This home has indicator sharing turned off.";
    else if (hypothetical) publishNote = "Not published: the current revision uses a hypothetical assumption, not recorded data.";
    else if (!local.length) publishNote = "Nothing to publish: no shareable pattern was detected.";
    else {
      publishedCount = this.peerStore.publish(local);
      publishNote = publishedCount ? `Published ${publishedCount} new indicator(s) to the shared store.` : "Indicators were already in the shared store.";
    }

    const adj = peerAdjustment(matches);
    const assessment = assess(rev.engine, adj, peerUncertainty(matches.length));
    rev.assessment = assessment;
    const at = nowIso();
    incident.peer = { checkedAt: at, queried: local, published: publishedCount > 0, matches, scoreAdjustment: adj };
    incident.updatedAt = at;
    incident.history.push({ at, kind: "peer_check", detail: `${matches.length} peer match(es); score adjustment +${adj}. ${publishNote}` });
    this.save();

    return {
      incidentId: incident.incidentId,
      revision: rev.revision,
      queried: local,
      peerIndicatorsVisible: this.peerStore.visibleTo(home.id).length,
      matches,
      scoreAdjustment: adj,
      publishedCount,
      publishNote,
      sharedFields: [...SHARED_FIELDS],
      withheldFields: WITHHELD_FIELDS,
      limitations: LIMITATIONS,
      updatedAssessment: assessment,
    };
  }

  // ---------- tool 4: prepare_response ----------

  prepareResponse(
    input:
      | { incidentId: string; decision: "propose" }
      | { incidentId: string; decision: "confirm" | "cancel"; proposalId: string; confirmationCode: string },
  ) {
    const incident = this.incident(input.incidentId);
    const home = this.home(incident.homeId);
    const rev = this.latest(incident);

    if (input.decision === "propose") {
      if (rev.assessment.classification === "no_concern") {
        return { incidentId: incident.incidentId, status: "not_needed" as const, reason: "The current assessment found no security concern, so no protective action is proposed.", proposal: null, recorded: false };
      }
      const actions = buildActions(home, rev.engine.triggeredRules.map((r) => r.ruleId), incident, rev.assessment);
      for (const p of incident.proposals) if (p.status === "pending") p.status = "superseded";
      const at = nowIso();
      const proposal: ResponseProposal = {
        proposalId: `PRP-${incident.incidentId.slice(4)}-${incident.proposals.length + 1}`,
        incidentId: incident.incidentId,
        revision: rev.revision,
        createdAt: at,
        confirmationCode: randomBytes(3).toString("hex"),
        status: "pending",
        summary: `${actions.length} simulated protective action(s) for a "${rev.assessment.classification}" assessment (score ${rev.assessment.score}).`,
        actions,
      };
      incident.proposals.push(proposal);
      incident.updatedAt = at;
      incident.history.push({ at, kind: "proposal", detail: `Proposed ${proposal.proposalId}: ${actions.map((a) => a.id).join(", ")}. Awaiting explicit user confirmation.` });
      this.save();
      return { incidentId: incident.incidentId, status: "awaiting_confirmation" as const, proposal, recorded: false, instructions: "Show these actions to the user. Call again with decision \"confirm\" or \"cancel\", the proposalId and the confirmationCode ONLY after the user explicitly decides." };
    }

    const proposal = incident.proposals.find((p) => p.proposalId === input.proposalId);
    if (!proposal) throw new ToolError("UNKNOWN_PROPOSAL", `No proposal ${input.proposalId} on ${incident.incidentId}. Call with decision "propose" first.`);
    if (proposal.status === "superseded") throw new ToolError("PROPOSAL_SUPERSEDED", `Proposal ${proposal.proposalId} was superseded by newer evidence or a newer proposal. Propose again.`);
    if (proposal.status !== "pending") throw new ToolError("PROPOSAL_NOT_PENDING", `Proposal ${proposal.proposalId} was already ${proposal.status}.`);
    if (proposal.confirmationCode !== input.confirmationCode) throw new ToolError("CONFIRMATION_MISMATCH", "The confirmationCode does not match this proposal. Nothing was recorded.");

    const at = nowIso();
    proposal.decidedAt = at;
    if (input.decision === "confirm") {
      proposal.status = "confirmed";
      proposal.outcome = proposal.actions.map((a) => `SIMULATED: ${a.label} (recorded only; no real device was contacted).`);
    } else {
      proposal.status = "cancelled";
      proposal.outcome = ["Cancelled by the user. No simulated action was recorded."];
    }
    incident.updatedAt = at;
    incident.history.push({ at, kind: `response_${proposal.status}`, detail: `${proposal.proposalId} ${proposal.status} by the user.` });
    this.save();
    return { incidentId: incident.incidentId, status: proposal.status, proposal, recorded: true, simulated: true as const };
  }
}

function peerUncertainty(n: number): string {
  return n
    ? "Peer match relies on a keyed device token and a pattern code reported by another home; it links devices or behaviours, not people."
    : "No other home reported a matching indicator. Absence of a match is not evidence of safety.";
}

function diffRevisions(prev: Assessment, next: Assessment, prevRules: string[], nextRules: string[]) {
  return {
    scoreFrom: prev.score,
    scoreTo: next.score,
    classificationFrom: prev.classification,
    classificationTo: next.classification,
    rulesAdded: nextRules.filter((r) => !prevRules.includes(r)),
    rulesRemoved: prevRules.filter((r) => !nextRules.includes(r)),
  };
}

function buildActions(home: Home, ruleIds: string[], incident: Incident, assessment: Assessment): ResponseAction[] {
  const has = (r: { id: string }) => ruleIds.includes(r.id);
  const lock = home.devices.find((d) => d.kind === "lock");
  const actions: ResponseAction[] = [];
  if (has(RULES.R1) && lock) {
    actions.push({ id: "lock.disable_keypad", label: `Disable keypad entry on ${lock.name} for 2 hours`, rationale: "Repeated incorrect codes were entered.", basedOn: [RULES.R1.id], simulated: true });
  }
  if ((has(RULES.R1) || has(RULES.R2) || has(RULES.R4)) && lock) {
    actions.push({ id: "lock.secure", label: `Lock ${lock.name} and keep auto-lock on`, rationale: has(RULES.R2) || has(RULES.R4) ? "Door activity happened while nobody was home." : "Someone tried to get through this door with incorrect codes.", basedOn: [RULES.R1, RULES.R2, RULES.R4].filter(has).map((r) => r.id), simulated: true });
  }
  if (has(RULES.R6)) {
    const codes = home.settings.accessCodes.filter((c) => c.kind === "guest").map((c) => c.label);
    actions.push({ id: "access.suspend_guest_code", label: `Suspend guest code ${codes.join(", ")} until the holder confirms the visit`, rationale: "A guest code was used outside its schedule.", basedOn: [RULES.R6.id], simulated: true });
  }
  if (has(RULES.R5)) {
    actions.push({ id: "camera.restore_recording", label: "Flag the camera for restore and continuous recording", rationale: "Camera coverage was lost during the activity.", basedOn: [RULES.R5.id], simulated: true });
  }
  if (has(RULES.R3)) {
    actions.push({ id: "watchlist.add_device", label: "Add the unrecognised device to this home's watchlist", rationale: "An unrecognised device was seen near the entry.", basedOn: [RULES.R3.id], simulated: true });
  }
  const members = home.settings.notifyMembers.map((id) => home.members.find((m) => m.id === id)?.label ?? id);
  actions.push({
    id: "notify.household",
    label: `Alert ${members.join(" and ")} with the incident summary`,
    rationale: `Assessment: ${assessment.classification.replace(/_/g, " ")} (${incident.incidentId}).`,
    basedOn: ruleIds,
    simulated: true,
  });
  return actions;
}

export { localTime };
