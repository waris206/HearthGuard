// Core domain types for HearthGuard. All homes, devices and events are synthetic fixtures.

export type Presence = "home" | "away";

export interface Member {
  id: string;
  label: string;
  role: "resident" | "guest";
}

export interface Device {
  id: string;
  name: string;
  kind: "lock" | "contact" | "motion" | "camera" | "hub";
  location: string;
  /** True for devices that sit on an entry point (doors). */
  entry: boolean;
  status: "online" | "offline";
}

export interface AccessCode {
  label: string;
  holder: string;
  kind: "resident" | "guest";
  /** Local-time window "HH:MM-HH:MM" during which a guest code is expected; omitted for residents. */
  schedule?: string;
}

export interface HomeSettings {
  awayModeEnabled: boolean;
  shareIndicators: boolean;
  notifyMembers: string[];
  accessCodes: AccessCode[];
}

export type EventType =
  | "lock.unlock_failed"
  | "lock.unlocked"
  | "lock.locked"
  | "contact.opened"
  | "contact.closed"
  | "motion.detected"
  | "camera.person_detected"
  | "camera.offline"
  | "camera.clip_unavailable"
  | "presence.arrived"
  | "presence.departed"
  | "network.unknown_device";

export interface HomeEvent {
  id: string;
  ts: string;
  deviceId: string;
  type: EventType;
  summary: string;
  /** Access code label used, for lock events. */
  codeLabel?: string;
  /** Member id for presence events. */
  memberId?: string;
  /** Raw radio fingerprint for unknown devices. Never leaves the home. */
  actorFingerprint?: string;
}

export interface OccupancySnapshot {
  mode: Presence;
  members: { memberId: string; presence: Presence; since: string }[];
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  expected: "normal" | "suspicious" | "ambiguous";
  window: { start: string; end: string };
  occupancyAtStart: OccupancySnapshot;
  events: HomeEvent[];
}

export interface Home {
  id: string;
  name: string;
  timezone: string;
  members: Member[];
  devices: Device[];
  settings: HomeSettings;
  scenarios: Scenario[];
}

export interface Assumptions {
  /** Override household occupancy for the whole window ("what if the owner was home?"). */
  occupancy?: Presence;
}

export type RiskLevel = "low" | "elevated" | "high";
export type Classification = "no_concern" | "inconclusive" | "likely_security_concern";
export type UncertaintyLevel = "low" | "medium" | "high";

export interface TriggeredRule {
  ruleId: string;
  name: string;
  weight: number;
  evidenceEventIds: string[];
  /** What the sensors recorded (observation). */
  explanation: string;
  /** What HearthGuard infers from it, including the benign alternative (inference). */
  inference: string;
}

export interface Mitigation {
  id: string;
  name: string;
  weight: number;
  evidenceEventIds: string[];
  explanation: string;
}

export interface RuleNotTriggered {
  ruleId: string;
  name: string;
  reason: string;
}

export interface Assessment {
  score: number;
  scoreNote: string;
  level: RiskLevel;
  classification: Classification;
  uncertainty: { level: UncertaintyLevel; factors: string[] };
  summary: string;
  recommendedNextSteps: string[];
}

export interface EngineResult {
  observedFacts: string[];
  triggeredRules: TriggeredRule[];
  mitigations: Mitigation[];
  notTriggered: RuleNotTriggered[];
  baseScore: number;
  uncertaintyFactors: { factor: string; weight: number }[];
  /** Raw (in-home only) actor fingerprints linked to triggered rules. */
  actorFingerprints: string[];
  patternCodes: string[];
  ruleEvents: Record<string, string[]>;
}

/** The ONLY record shape that may cross the home boundary. */
export interface SharedIndicator {
  schemaVersion: 1;
  indicatorId: string;
  sourceHomeToken: string;
  patternCode: string;
  actorToken: string | null;
  severity: RiskLevel;
  confidence: "low" | "medium" | "high";
  observedHour: string;
}

export interface PeerMatch {
  indicator: SharedIndicator;
  matchType: "actor_and_pattern" | "actor" | "pattern";
  matchedOn: string[];
  strength: "strong" | "moderate" | "weak";
  /** Plain-language meaning of this match; never a claim of compromise. */
  interpretation: string;
}

export interface PeerCheck {
  checkedAt: string;
  queried: SharedIndicator[];
  published: boolean;
  matches: PeerMatch[];
  scoreAdjustment: number;
}

export interface ResponseAction {
  id: string;
  label: string;
  rationale: string;
  basedOn: string[];
  simulated: true;
}

export interface ResponseProposal {
  proposalId: string;
  incidentId: string;
  revision: number;
  createdAt: string;
  confirmationCode: string;
  status: "pending" | "confirmed" | "cancelled" | "superseded";
  summary: string;
  proportionality: string;
  actions: ResponseAction[];
  decidedAt?: string;
  outcome?: string[];
}

export interface IncidentRevision {
  revision: number;
  at: string;
  assumptions: Assumptions;
  engine: EngineResult;
  assessment: Assessment;
}

export interface Incident {
  incidentId: string;
  homeId: string;
  scenarioId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revisions: IncidentRevision[];
  peer: PeerCheck | null;
  proposals: ResponseProposal[];
  history: { at: string; kind: string; detail: string }[];
}
