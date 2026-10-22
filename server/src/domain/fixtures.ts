import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Home, Scenario } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (compiled): data/ lives next to them.
const DATA_DIR = join(here, "..", "..", "data", "homes");

const eventTypes = [
  "lock.unlock_failed",
  "lock.unlocked",
  "lock.locked",
  "contact.opened",
  "contact.closed",
  "motion.detected",
  "camera.person_detected",
  "camera.offline",
  "camera.clip_unavailable",
  "presence.arrived",
  "presence.departed",
  "network.unknown_device",
] as const;

const isoWithOffset = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

const HomeSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  members: z.array(z.object({ id: z.string(), label: z.string(), role: z.enum(["resident", "guest"]) })),
  devices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(["lock", "contact", "motion", "camera", "hub"]),
      location: z.string(),
      entry: z.boolean(),
      status: z.enum(["online", "offline"]),
    }),
  ),
  settings: z.object({
    awayModeEnabled: z.boolean(),
    shareIndicators: z.boolean(),
    notifyMembers: z.array(z.string()),
    accessCodes: z.array(
      z.object({
        label: z.string(),
        holder: z.string(),
        kind: z.enum(["resident", "guest"]),
        schedule: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
      }),
    ),
  }),
  scenarios: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      expected: z.enum(["normal", "suspicious", "ambiguous"]),
      window: z.object({ start: isoWithOffset, end: isoWithOffset }),
      occupancyAtStart: z.object({
        mode: z.enum(["home", "away"]),
        members: z.array(z.object({ memberId: z.string(), presence: z.enum(["home", "away"]), since: isoWithOffset })),
      }),
      events: z.array(
        z.object({
          id: z.string(),
          ts: isoWithOffset,
          deviceId: z.string(),
          type: z.enum(eventTypes),
          summary: z.string(),
          codeLabel: z.string().optional(),
          memberId: z.string().optional(),
          actorFingerprint: z.string().optional(),
        }),
      ),
    }),
  ),
});

function loadHome(file: string): Home {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
  const home = HomeSchema.parse(raw) as Home;
  const deviceIds = new Set(home.devices.map((d) => d.id));
  for (const s of home.scenarios) {
    for (const e of s.events) {
      if (!deviceIds.has(e.deviceId)) throw new Error(`Fixture ${file}: event ${e.id} references unknown device ${e.deviceId}`);
    }
    s.events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }
  return home;
}

const HOMES: Home[] = [loadHome("home-a.json"), loadHome("home-b.json")];

export function listHomes(): Home[] {
  return HOMES;
}

export function getHome(homeId: string): Home | undefined {
  return HOMES.find((h) => h.id === homeId);
}

export function getScenario(home: Home, scenarioId: string): Scenario | undefined {
  return home.scenarios.find((s) => s.id === scenarioId);
}
