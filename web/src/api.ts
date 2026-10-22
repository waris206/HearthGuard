// Typed client for the HearthGuard REST API. Investigation turns are executed server-side by
// an MCP client calling the MCP tools; the UI renders the real tool steps it gets back.

export type Classification = "no_concern" | "inconclusive" | "likely_security_concern";
export type Level = "low" | "elevated" | "high";

export interface Assessment {
  score: number;
  scoreNote: string;
  level: Level;
  classification: Classification;
  uncertainty: { level: "low" | "medium" | "high"; factors: string[] };
  summary: string;
  recommendedNextSteps: string[];
}

export interface TimelineEvent {
  id: string;
  ts: string;
  localTime: string;
  deviceId: string;
  device: string;
  location: string;
  type: string;
  summary: string;
  ruleIds: string[];
}

export interface Rule {
  ruleId: string;
  name: string;
  weight: number;
  evidenceEventIds: string[];
  explanation: string;
  inference: string;
}

export interface Mitigation {
  id: string;
  name: string;
  weight: number;
  evidenceEventIds: string[];
  explanation: string;
}

export interface Investigation {
  incidentId: string;
  revision: number;
  home: { id: string; name: string };
  scenario: { id: string; title: string; window: { start: string; end: string } };
  assumptions: { occupancy?: "home" | "away" };
  timeline: TimelineEvent[];
  observedFacts: string[];
  triggeredRules: Rule[];
  mitigations: Mitigation[];
  notTriggered: { ruleId: string; name: string; reason: string }[];
  assessment: Assessment;
  changes: null | { scoreFrom: number; scoreTo: number; classificationFrom: Classification; classificationTo: Classification; rulesAdded: string[]; rulesRemoved: string[] };
}

export interface Indicator {
  schemaVersion: 1;
  indicatorId: string;
  sourceHomeToken: string;
  patternCode: string;
  actorToken: string | null;
  severity: Level;
  confidence: "low" | "medium" | "high";
  observedHour: string;
}

export interface PeerResult {
  incidentId: string;
  queried: Indicator[];
  peerIndicatorsVisible: number;
  matches: { indicator: Indicator; matchType: string; matchedOn: string[]; strength: "strong" | "moderate" | "weak"; interpretation: string }[];
  scoreAdjustment: number;
  interpretation: string;
  publishedCount: number;
  publishNote: string;
  sharedFields: string[];
  withheldFields: string[];
  limitations: string[];
  updatedAssessment: Assessment;
}

export interface Proposal {
  proposalId: string;
  incidentId: string;
  revision: number;
  createdAt: string;
  status: "pending" | "confirmed" | "cancelled" | "superseded";
  summary: string;
  proportionality: string;
  actions: { id: string; label: string; rationale: string; basedOn: string[]; simulated: true }[];
  decidedAt?: string;
  outcome?: string[];
}

export interface HomeContext {
  home: { id: string; name: string; timezone: string; synthetic: true };
  members: { id: string; label: string; role: string }[];
  devices: { id: string; name: string; kind: string; location: string; entry: boolean; status: string }[];
  settings: { awayModeEnabled: boolean; shareIndicators: boolean; notifyMembers: string[]; accessCodes: { label: string; kind: string; schedule: string | null }[] };
  activeScenario: null | {
    id: string;
    title: string;
    window: { start: string; end: string };
    occupancy: { mode: string; members: { memberId: string; label: string; presence: string; since: string }[] };
    eventCount: number;
  };
}

export interface ToolStep {
  tool: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface TurnResult {
  conversationId: string;
  reply: string;
  intents: string[];
  steps: ToolStep[];
  suggestions: string[];
  state: {
    id: string;
    homeId: string;
    scenarioId: string;
    incidentId: string | null;
    assumptions: { occupancy?: "home" | "away" };
    context: HomeContext | null;
    investigation: Investigation | null;
    peer: PeerResult | null;
    proposal: Proposal | null;
    lastDecision: unknown;
  };
  mcp: { protocolVersion?: string; server?: { name: string; version: string } };
}

export interface HomeSummary {
  id: string;
  name: string;
  scenarios: { id: string; title: string; description: string; expected: "normal" | "suspicious" | "ambiguous" }[];
}

export interface IncidentRecord {
  incidentId: string;
  homeId: string;
  scenarioId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revisions: { revision: number; at: string; assumptions: { occupancy?: string }; assessment: Assessment }[];
  peer: null | { matches: unknown[]; scoreAdjustment: number };
  proposals: Proposal[];
  history: { at: string; kind: string; detail: string }[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  homes: () => req<HomeSummary[]>("/homes"),
  incidents: () => req<IncidentRecord[]>("/incidents"),
  peerStore: () => req<Indicator[]>("/peer-store"),
  reset: () => req<{ ok: true }>("/reset", { method: "POST", body: "{}" }),
  start: (homeId: string, scenarioId: string) => req<TurnResult>("/conversations", { method: "POST", body: JSON.stringify({ homeId, scenarioId }) }),
  send: (id: string, text: string) => req<TurnResult>(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  decide: (id: string, proposalId: string, decision: "confirm" | "cancel") =>
    req<TurnResult>(`/conversations/${id}/decision`, { method: "POST", body: JSON.stringify({ proposalId, decision }) }),
};
