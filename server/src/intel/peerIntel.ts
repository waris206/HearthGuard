// Privacy-preserving cross-home indicator sharing (local, synthetic demonstration).
//
// What crosses the home boundary is ONLY the SharedIndicator shape below: a pattern code,
// a keyed-hash token of an unrecognised device's radio fingerprint, a severity/confidence
// band and an hour bucket. Raw events, device names, occupancy and exact times stay home.
//
// Pseudonymisation uses HMAC-SHA256 with a shared demo key so two homes derive the same
// token for the same device. This is NOT anonymity: anyone holding the key can test a
// guessed fingerprint. It is a demonstration of data minimisation, not a formal guarantee.
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { EngineResult, Incident, PeerMatch, RiskLevel, SharedIndicator } from "../domain/types.js";
import { levelFor } from "../engine/riskEngine.js";

const DEMO_KEY = process.env.HG_INDICATOR_KEY ?? "hearthguard-local-demo-key";

export const SHARED_FIELDS = [
  "schemaVersion",
  "indicatorId",
  "sourceHomeToken",
  "patternCode",
  "actorToken",
  "severity",
  "confidence",
  "observedHour",
] as const;

export const WITHHELD_FIELDS = [
  "Raw event timeline and event ids",
  "Exact event timestamps (only the UTC hour is shared)",
  "Occupancy and presence history",
  "Device names, locations and inventory",
  "Access-code labels and household member identities",
  "Raw radio fingerprints (only a keyed hash is shared)",
  "Home identity (only a pseudonymous token is shared)",
];

export const LIMITATIONS = [
  "Local synthetic demonstration: both homes and the shared store run inside this one server process.",
  "Tokens are keyed hashes with a shared demo key. They hide raw identifiers from casual view but are not anonymous against anyone holding the key.",
  "Radio fingerprints can be randomised or spoofed, so a token match links devices, not people.",
  "A pattern-only match means a similar behaviour was seen elsewhere, not that the same actor was involved.",
  "Peer indicators are self-reported by other homes' rule engines and are not independently verified.",
];

export const SharedIndicatorSchema = z
  .object({
    schemaVersion: z.literal(1),
    indicatorId: z.string().regex(/^ind_[a-f0-9]{12}$/),
    sourceHomeToken: z.string().regex(/^home_[a-f0-9]{10}$/),
    patternCode: z.enum(["ENTRY_REPEATED_FAILED_ACCESS", "UNKNOWN_DEVICE_AT_ENTRY", "ENTRY_WITHOUT_UNLOCK_AFTER_FAILURES"]),
    actorToken: z.string().regex(/^act_[a-f0-9]{16}$/).nullable(),
    severity: z.enum(["low", "elevated", "high"]),
    confidence: z.enum(["low", "medium", "high"]),
    observedHour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/),
  })
  .strict();

function hmac(value: string): string {
  return createHmac("sha256", DEMO_KEY).update(value).digest("hex");
}

export const homeToken = (homeId: string) => `home_${hmac(`home:${homeId}`).slice(0, 10)}`;
export const actorToken = (fingerprint: string) => `act_${hmac(`actor:${fingerprint.toLowerCase()}`).slice(0, 16)}`;

function hourBucket(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 13) + ":00Z";
}

/** Derive the minimum shareable indicators from an engine result. Pure function. */
export function deriveIndicators(homeId: string, engine: EngineResult, observedAt: string, score: number, uncertainty: "low" | "medium" | "high"): SharedIndicator[] {
  if (score < 20) return [];
  const actors = engine.actorFingerprints.length ? engine.actorFingerprints.map(actorToken) : [null];
  const severity: RiskLevel = levelFor(score);
  const confidence = uncertainty === "low" ? "high" : uncertainty === "medium" ? "medium" : "low";
  const src = homeToken(homeId);
  const observedHour = hourBucket(observedAt);
  const out: SharedIndicator[] = [];
  for (const patternCode of engine.patternCodes) {
    for (const actor of actors) {
      const indicatorId = `ind_${hmac(`${src}|${patternCode}|${actor}|${observedHour}`).slice(0, 12)}`;
      out.push(SharedIndicatorSchema.parse({ schemaVersion: 1, indicatorId, sourceHomeToken: src, patternCode, actorToken: actor, severity, confidence, observedHour }));
    }
  }
  return out;
}

export class PeerIntelStore {
  private indicators: SharedIndicator[] = [];

  publish(list: SharedIndicator[]): number {
    let added = 0;
    for (const raw of list) {
      // Strict parse rejects any extra field (e.g. a raw timeline) at the boundary.
      const ind = SharedIndicatorSchema.parse(raw);
      if (!this.indicators.some((x) => x.indicatorId === ind.indicatorId)) {
        this.indicators.push(ind);
        added++;
      }
    }
    return added;
  }

  /** Indicators from OTHER homes, as clean copies of the shared shape only. */
  visibleTo(homeId: string): SharedIndicator[] {
    const self = homeToken(homeId);
    return this.indicators.filter((i) => i.sourceHomeToken !== self).map((i) => SharedIndicatorSchema.parse({ ...i }));
  }

  all(): SharedIndicator[] {
    return this.indicators.map((i) => ({ ...i }));
  }

  clear(): void {
    this.indicators = [];
  }
}

export function matchIndicators(homeId: string, local: SharedIndicator[], store: PeerIntelStore): PeerMatch[] {
  const peers = store.visibleTo(homeId);
  const localActors = new Set(local.map((l) => l.actorToken).filter(Boolean));
  const localPatterns = new Set(local.map((l) => l.patternCode));
  const localHour = local.length ? Date.parse(local[0].observedHour) : NaN;
  const matches: PeerMatch[] = [];
  for (const p of peers) {
    const actor = p.actorToken !== null && localActors.has(p.actorToken);
    const pattern = localPatterns.has(p.patternCode);
    const withinWindow = Math.abs(Date.parse(p.observedHour) - localHour) <= 72 * 3600_000;
    if (actor && pattern)
      matches.push({ indicator: p, matchType: "actor_and_pattern", matchedOn: ["actorToken", "patternCode"], strength: "strong", interpretation: "The same device token showed the same behaviour at another home. That links the incidents; it does not prove a break-in or identify a person." });
    else if (actor)
      matches.push({ indicator: p, matchType: "actor", matchedOn: ["actorToken"], strength: "moderate", interpretation: "The same device token was reported by another home for a different behaviour. It may be the same device, or a spoofed or randomised identifier." });
    else if (pattern && withinWindow)
      matches.push({ indicator: p, matchType: "pattern", matchedOn: ["patternCode", "observedHour within 72h"], strength: "weak", interpretation: "A similar behaviour was seen elsewhere recently. There is no evidence it involves the same actor." });
  }
  return matches;
}

export const MATCH_DISCLAIMER =
  "A peer match is a correlation between compact indicators from different homes. It raises the heuristic score but is not proof of compromise and does not identify anyone.";

export function peerAdjustment(matches: PeerMatch[]): number {
  if (matches.some((m) => m.strength === "strong")) return 15;
  if (matches.some((m) => m.strength === "moderate")) return 12;
  if (matches.some((m) => m.strength === "weak")) return 5;
  return 0;
}

export function latestIndicators(incident: Incident, observedAt: string): SharedIndicator[] {
  const rev = incident.revisions[incident.revisions.length - 1];
  return deriveIndicators(incident.homeId, rev.engine, observedAt, rev.engine.baseScore, rev.assessment.uncertainty.level);
}
