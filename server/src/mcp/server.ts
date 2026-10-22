// MCP server exposing HearthGuard's four investigation tools (official TypeScript SDK).
// Output schemas list the guaranteed fields and stay open (looseObject) for the additional documented fields.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { HearthGuardService, ToolError } from "../service/hearthguard.js";

export const SERVER_INFO = { name: "hearthguard", version: "1.0.0" } as const;

const homeId = z.string().min(1).max(64).describe('Synthetic home id, e.g. "home-a" or "home-b".');
const scenarioId = z.string().min(1).max(64).describe('Scenario id from get_home_context, e.g. "a-suspicious-front-door".');
const incidentId = z.string().regex(/^INC-\d{4}$/).describe('Incident id returned by investigate_events, e.g. "INC-0002".');

const assessmentOut = z.looseObject({
  score: z.number(),
  scoreNote: z.string(),
  level: z.enum(["low", "elevated", "high"]),
  classification: z.enum(["no_concern", "inconclusive", "likely_security_concern"]),
  uncertainty: z.object({ level: z.enum(["low", "medium", "high"]), factors: z.array(z.string()) }),
  summary: z.string(),
  recommendedNextSteps: z.array(z.string()),
});

function ok(data: object): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
}

function fail(err: unknown): CallToolResult {
  const error =
    err instanceof ToolError
      ? { code: err.code, message: err.message }
      : { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) };
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error }) }] };
}

function run(fn: () => object): CallToolResult {
  try {
    return ok(fn());
  } catch (e) {
    return fail(e);
  }
}

export function createMcpServer(service: HearthGuardService): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "HearthGuard investigates SYNTHETIC smart-home security events. Typical flow: get_home_context -> investigate_events -> check_peer_intelligence -> prepare_response(decision='propose'). Only call prepare_response with decision 'confirm' after the human user explicitly confirms. All actions are simulated; no real device is controlled. Scores are heuristics, not probabilities.",
  });

  server.registerTool(
    "get_home_context",
    {
      title: "Get home context",
      description:
        "Return a synthetic home's device inventory, members, relevant settings, available scenarios and (optionally) a scenario's occupancy context. Read-only.",
      inputSchema: { homeId, scenarioId: scenarioId.optional() },
      outputSchema: z.looseObject({
        home: z.looseObject({ id: z.string(), name: z.string(), synthetic: z.literal(true) }),
        devices: z.array(z.looseObject({ id: z.string(), name: z.string() })),
        scenarios: z.array(z.looseObject({ id: z.string(), title: z.string() })),
        activeScenario: z.looseObject({ id: z.string() }).nullable(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => run(() => service.getHomeContext(args)),
  );

  server.registerTool(
    "investigate_events",
    {
      title: "Investigate events",
      description:
        "Retrieve a scenario's event timeline and evaluate it with HearthGuard's deterministic behavioural rules (HG-R1..R6). Returns observed facts, triggered rules with evidence event ids, rules not triggered, uncertainty and a heuristic score. Pass incidentId to add a revision to an existing incident (e.g. with assumptions.occupancy='home' for a what-if).",
      inputSchema: {
        homeId,
        scenarioId,
        incidentId: incidentId.optional(),
        assumptions: z
          .object({ occupancy: z.enum(["home", "away"]).optional().describe("Hypothetical occupancy override for the whole window.") })
          .strict()
          .optional(),
      },
      outputSchema: z.looseObject({
        incidentId: z.string(),
        revision: z.number().int(),
        timeline: z.array(z.looseObject({ id: z.string(), ts: z.string(), summary: z.string(), ruleIds: z.array(z.string()) })),
        observedFacts: z.array(z.string()),
        triggeredRules: z.array(z.looseObject({ ruleId: z.string(), weight: z.number(), evidenceEventIds: z.array(z.string()), explanation: z.string() })),
        assessment: assessmentOut,
      }),
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => run(() => service.investigateEvents(args)),
  );

  server.registerTool(
    "check_peer_intelligence",
    {
      title: "Check peer intelligence",
      description:
        "Derive compact indicators (pattern code, keyed device token, severity, hour bucket) from an incident, compare them with indicators shared by OTHER synthetic homes, and optionally publish this home's indicators. Never shares or returns raw timelines, occupancy, device names or exact times.",
      inputSchema: {
        incidentId,
        publish: z.boolean().optional().describe("Publish this incident's derived indicators to the shared store (default true; never for hypothetical revisions)."),
      },
      outputSchema: z.looseObject({
        incidentId: z.string(),
        queried: z.array(z.looseObject({ indicatorId: z.string(), patternCode: z.string() })),
        matches: z.array(z.looseObject({ matchType: z.string(), strength: z.string() })),
        scoreAdjustment: z.number(),
        withheldFields: z.array(z.string()),
        limitations: z.array(z.string()),
        updatedAssessment: assessmentOut,
      }),
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => run(() => service.checkPeerIntelligence(args)),
  );

  server.registerTool(
    "prepare_response",
    {
      title: "Prepare response",
      description:
        "Two-step, human-confirmed SIMULATED response. decision='propose' builds protective actions from the incident's evidence and returns a proposalId + confirmationCode without recording anything. decision='confirm' or 'cancel' (with proposalId and confirmationCode) records the user's choice in the incident history. Only send 'confirm' after the human explicitly confirms. No real device is ever controlled.",
      inputSchema: {
        incidentId,
        decision: z.enum(["propose", "confirm", "cancel"]),
        proposalId: z.string().regex(/^PRP-\d{4}-\d+$/).optional(),
        confirmationCode: z.string().regex(/^[a-f0-9]{6}$/).optional(),
      },
      outputSchema: z.looseObject({
        incidentId: z.string(),
        status: z.enum(["not_needed", "awaiting_confirmation", "confirmed", "cancelled"]),
        recorded: z.boolean(),
        proposal: z.looseObject({ proposalId: z.string(), status: z.string(), actions: z.array(z.looseObject({ id: z.string(), simulated: z.literal(true) })) }).nullable(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) =>
      run(() => {
        if (args.decision === "propose") return service.prepareResponse({ incidentId: args.incidentId, decision: "propose" });
        if (!args.proposalId || !args.confirmationCode) {
          throw new ToolError("INVALID_INPUT", `decision "${args.decision}" requires proposalId and confirmationCode from a prior "propose" call.`);
        }
        return service.prepareResponse({ incidentId: args.incidentId, decision: args.decision, proposalId: args.proposalId, confirmationCode: args.confirmationCode });
      }),
  );

  return server;
}
