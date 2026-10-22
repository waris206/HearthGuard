// Conversational investigation orchestrator. It is an MCP *client*: every investigation step
// is a real tools/call over Streamable HTTP to HearthGuard's MCP endpoint, and every reply is
// composed from the structured results that came back. Intent detection is deterministic
// keyword matching; no LLM is involved and none is required.
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type Json = Record<string, any>;

export interface ToolStep {
  tool: string;
  arguments: Json;
  ok: boolean;
  durationMs: number;
  result?: Json;
  error?: { code: string; message: string };
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
  steps?: ToolStep[];
}

export interface Conversation {
  id: string;
  homeId: string;
  scenarioId: string;
  incidentId: string | null;
  assumptions: { occupancy?: "home" | "away" };
  context: Json | null;
  investigation: Json | null;
  peer: Json | null;
  proposal: Json | null;
  lastDecision: Json | null;
  messages: ChatMessage[];
}

export interface TurnResult {
  conversationId: string;
  reply: string;
  intents: string[];
  steps: ToolStep[];
  suggestions: string[];
  state: Omit<Conversation, "messages" | "proposal"> & { proposal: Json | null };
  mcp: { protocolVersion: string | undefined; server: Json | undefined };
}

export class ToolCallFailed extends Error {
  constructor(public readonly step: ToolStep) {
    super(step.error?.message ?? "tool failed");
  }
}

export function detectIntents(text: string) {
  const t = text.toLowerCase();
  const intents = new Set<string>();
  const whatIf =
    /\b(what if|suppose|assume|assuming|actually|turns out)\b/.test(t) &&
    /\b(home|away|inside|there|out|nobody|no one|someone|owner)\b/.test(t);
  if (/\b(use|back to|revert to) (the )?(recorded|real|actual|sensor)\b|\bundo\b|\breset (the )?assumption/.test(t)) intents.add("whatif_reset");
  else if (whatIf) intents.add(/\b(away|not home|nobody|no one|out)\b/.test(t) ? "whatif_away" : "whatif_home");
  if (/\b(another|other|second|neighbou?r'?s?|peer)\b.*\bhomes?\b|\bseen (this|a similar|it|that)\b|\belsewhere\b|\bintel(ligence)?\b|\bsimilar pattern\b/.test(t)) intents.add("peer");
  if (/what should i do|what do i do|recommend|\brespon(d|se)\b|\bprotect|next steps?|\bsecure\b|\bact(ion)?s?\b/.test(t)) intents.add("respond");
  if (/^\s*(yes,?\s*)?(confirm|approve|go ahead)\b/.test(t)) intents.add("confirm");
  if (/^\s*(no,?\s*)?(cancel|don'?t|do not|abort)\b/.test(t)) intents.add("cancel");
  if (/\bwhy\b|\bexplain|how (sure|confident|certain)|uncertain|\bconfidence\b|what evidence|show (me )?the evidence/.test(t)) intents.add("explain");
  if (/\btimeline\b|what happened|\bsequence\b|\bevents\b/.test(t)) intents.add("timeline");
  if (/\binvestigat|\blook into\b|\banaly[sz]|\bre-?run\b|\bcheck (the|this|my)\b|\bsecurity concern\b|\bsuspicious\b/.test(t)) intents.add("investigate");
  if (/\bhistory\b|past incidents|previous incidents/.test(t)) intents.add("history");
  return intents;
}

const pct = (n: number) => `${n}/100`;
const CLASS_LABEL: Record<string, string> = {
  no_concern: "no security concern",
  inconclusive: "inconclusive",
  likely_security_concern: "likely security concern",
};

export class InvestigationAssistant {
  private conversations = new Map<string, Conversation>();
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(private readonly mcpUrl: () => string) {}

  private async mcp(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: "hearthguard-assistant", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl()));
    await client.connect(transport);
    this.client = client;
    this.transport = transport;
    return client;
  }

  mcpInfo() {
    return { protocolVersion: this.transport?.protocolVersion, server: this.client?.getServerVersion() as Json | undefined };
  }

  async close() {
    await this.client?.close();
    this.client = null;
  }

  private async call(steps: ToolStep[], tool: string, args: Json): Promise<Json> {
    const started = performance.now();
    const step: ToolStep = { tool, arguments: args, ok: false, durationMs: 0 };
    steps.push(step);
    try {
      const client = await this.mcp();
      const res = await client.callTool({ name: tool, arguments: args });
      step.durationMs = Math.round(performance.now() - started);
      if (res.isError) {
        const text = (res.content as any[])?.[0]?.text ?? "";
        let error = { code: "TOOL_ERROR", message: text };
        try {
          error = JSON.parse(text).error ?? error;
        } catch {
          /* plain-text error from the SDK (e.g. input validation) */
        }
        step.error = error;
        throw new ToolCallFailed(step);
      }
      step.ok = true;
      step.result = res.structuredContent as Json;
      return step.result;
    } catch (e) {
      step.durationMs = Math.round(performance.now() - started);
      if (e instanceof ToolCallFailed) throw e;
      // Transport-level failure: drop the client so the next call reconnects.
      this.client = null;
      step.error = { code: "TRANSPORT_ERROR", message: e instanceof Error ? e.message : String(e) };
      throw new ToolCallFailed(step);
    }
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  async start(homeId: string, scenarioId: string): Promise<TurnResult> {
    const conv: Conversation = {
      id: randomUUID(),
      homeId,
      scenarioId,
      incidentId: null,
      assumptions: {},
      context: null,
      investigation: null,
      peer: null,
      proposal: null,
      lastDecision: null,
      messages: [],
    };
    const steps: ToolStep[] = [];
    let reply: string;
    try {
      conv.context = await this.call(steps, "get_home_context", { homeId, scenarioId });
      this.conversations.set(conv.id, conv);
      const sc = conv.context.activeScenario;
      reply = `Connected to ${conv.context.home.name}. Selected window: "${sc.title}" (${sc.eventCount} events). Household occupancy at the start: ${sc.occupancy.members
        .map((m: Json) => `${m.label} ${m.presence}`)
        .join(", ")}. Ask me to investigate whenever you're ready.`;
    } catch (e) {
      reply = this.failureText(e);
    }
    return this.finish(conv, null, reply, ["start"], steps);
  }

  async message(id: string, text: string): Promise<TurnResult> {
    const conv = this.must(id);
    const intents = detectIntents(text);
    const steps: ToolStep[] = [];
    const parts: string[] = [];
    try {
      if (intents.has("confirm") || intents.has("cancel")) {
        if (!conv.proposal || conv.proposal.status !== "pending") {
          parts.push("There is no pending response to confirm or cancel. Ask \"What should I do?\" to prepare one.");
        } else {
          parts.push(await this.decideInner(conv, steps, intents.has("confirm") ? "confirm" : "cancel"));
        }
        return this.finish(conv, text, parts.join("\n\n"), [...intents], steps);
      }

      let investigatedNow = false;
      const wantsWhatIf = intents.has("whatif_home") || intents.has("whatif_away") || intents.has("whatif_reset");
      if (!conv.investigation || intents.has("investigate") || wantsWhatIf) {
        if (intents.has("whatif_home")) conv.assumptions = { occupancy: "home" };
        else if (intents.has("whatif_away")) conv.assumptions = { occupancy: "away" };
        else if (intents.has("whatif_reset")) conv.assumptions = {};
        const firstTime = !conv.investigation;
        if (firstTime) {
          conv.context = await this.call(steps, "get_home_context", { homeId: conv.homeId, scenarioId: conv.scenarioId });
        }
        const args: Json = { homeId: conv.homeId, scenarioId: conv.scenarioId };
        if (conv.incidentId) args.incidentId = conv.incidentId;
        if (conv.assumptions.occupancy) args.assumptions = { ...conv.assumptions };
        const inv = await this.call(steps, "investigate_events", args);
        conv.investigation = inv;
        conv.incidentId = inv.incidentId;
        investigatedNow = true;
        if (conv.proposal?.status === "pending") conv.proposal = { ...conv.proposal, status: "superseded" };
        parts.push(wantsWhatIf && inv.changes ? this.describeWhatIf(inv) : this.describeInvestigation(inv));
      }

      const a = conv.investigation!.assessment;
      // Branch on evidence: peer check when there is something to compare or the user asked,
      // or to refresh a previous peer comparison after the evidence changed.
      const shouldPeer = intents.has("peer") || (investigatedNow && (a.classification !== "no_concern" || conv.peer !== null));
      if (shouldPeer) {
        const peer = await this.call(steps, "check_peer_intelligence", { incidentId: conv.incidentId });
        conv.peer = peer;
        conv.investigation = { ...conv.investigation!, assessment: peer.updatedAssessment };
        parts.push(this.describePeer(peer, intents.has("peer") || !investigatedNow || !wantsWhatIf));
      } else if (intents.has("peer") === false && investigatedNow && a.classification === "no_concern") {
        parts.push("I skipped the cross-home check because no shareable suspicious pattern was found.");
      }

      const current = conv.investigation!.assessment;
      const hadProposal = conv.proposal !== null && conv.proposal.status === "superseded" && investigatedNow;
      const shouldRespond =
        intents.has("respond") || hadProposal || (investigatedNow && !wantsWhatIf && current.classification === "likely_security_concern");
      if (shouldRespond) {
        const res = await this.call(steps, "prepare_response", { incidentId: conv.incidentId, decision: "propose" });
        conv.proposal = res.proposal ?? null;
        parts.push(this.describeProposal(res, hadProposal && !intents.has("respond")));
      }

      if (intents.has("explain")) parts.push(this.describeWhy(conv));
      if (intents.has("timeline")) parts.push(this.describeTimeline(conv));
      if (intents.has("history")) parts.push("Your incident history is in the left panel. Each entry lists every investigation revision, peer check and decision recorded for it.");

      if (!parts.length) {
        parts.push(
          "I can investigate the selected window, explain the evidence, check whether another home reported a related pattern, test a what-if (for example \"What if the owner was actually home?\"), or prepare a response for you to confirm.",
        );
      }
      if (!investigatedNow && !shouldPeer && !shouldRespond && (intents.has("explain") || intents.has("timeline"))) {
        parts.push("_(Answered from the current incident record; no new tool calls were needed.)_");
      }
    } catch (e) {
      parts.push(this.failureText(e));
    }
    return this.finish(conv, text, parts.join("\n\n"), [...intents], steps);
  }

  async decide(id: string, proposalId: string, decision: "confirm" | "cancel"): Promise<TurnResult> {
    const conv = this.must(id);
    const steps: ToolStep[] = [];
    let reply: string;
    if (!conv.proposal || conv.proposal.proposalId !== proposalId) {
      reply = `Proposal ${proposalId} is not the current proposal for this investigation, so nothing was recorded.`;
    } else {
      try {
        reply = await this.decideInner(conv, steps, decision);
      } catch (e) {
        reply = this.failureText(e);
      }
    }
    return this.finish(conv, decision === "confirm" ? "Confirm the proposed response." : "Cancel the proposed response.", reply, [decision], steps);
  }

  private async decideInner(conv: Conversation, steps: ToolStep[], decision: "confirm" | "cancel"): Promise<string> {
    const p = conv.proposal!;
    const res = await this.call(steps, "prepare_response", {
      incidentId: conv.incidentId,
      decision,
      proposalId: p.proposalId,
      confirmationCode: p.confirmationCode,
    });
    conv.proposal = res.proposal;
    conv.lastDecision = res;
    if (res.status === "confirmed") {
      return `Recorded your confirmation for ${p.proposalId}. These SIMULATED actions were logged to ${conv.incidentId}; no real device was contacted:\n${res.proposal.actions
        .map((a: Json) => `- ${a.label}`)
        .join("\n")}`;
    }
    return `Cancelled ${p.proposalId}. No simulated action was recorded; the cancellation is logged in ${conv.incidentId}.`;
  }

  private must(id: string): Conversation {
    const c = this.conversations.get(id);
    if (!c) throw new Error(`Unknown conversation ${id}`);
    return c;
  }

  private failureText(e: unknown): string {
    if (e instanceof ToolCallFailed) {
      return `The ${e.step.tool} tool failed (${e.step.error?.code}): ${e.step.error?.message}. I have not guessed or filled in its result.`;
    }
    return `Something went wrong: ${e instanceof Error ? e.message : String(e)}. No result was fabricated.`;
  }

  private describeInvestigation(inv: Json): string {
    const a = inv.assessment;
    const lines = [
      `**${inv.scenario.title}** (${inv.incidentId}, revision ${inv.revision}). ${a.summary}`,
      `Heuristic score ${pct(a.score)} (${a.level}), classification **${CLASS_LABEL[a.classification]}**, uncertainty ${a.uncertainty.level}.`,
    ];
    if (inv.triggeredRules.length) {
      lines.push("Evidence:");
      for (const r of inv.triggeredRules) lines.push(`- ${r.ruleId} ${r.name} (+${r.weight}): ${r.explanation}`);
    }
    for (const m of inv.mitigations) lines.push(`- ${m.id} ${m.name} (${m.weight}): ${m.explanation}`);
    if (a.uncertainty.factors.length) lines.push(`What I can't tell: ${a.uncertainty.factors.join(" ")}`);
    return lines.join("\n");
  }

  private describeWhatIf(inv: Json): string {
    const c = inv.changes;
    const a = inv.assessment;
    const occ = inv.assumptions?.occupancy;
    const head = occ
      ? `Re-assessed ${inv.incidentId} assuming the household was **${occ}** for the whole window (a hypothesis, not recorded data).`
      : `Re-assessed ${inv.incidentId} using the recorded presence data again.`;
    const lines = [head, `Score ${pct(c.scoreFrom)} → ${pct(c.scoreTo)}; classification ${CLASS_LABEL[c.classificationFrom]} → **${CLASS_LABEL[c.classificationTo]}**.`];
    const reason = (id: string) => inv.notTriggered.find((n: Json) => n.ruleId === id)?.reason;
    for (const id of c.rulesRemoved) lines.push(`- No longer triggered: ${id}. ${reason(id) ?? ""}`.trim());
    for (const id of c.rulesAdded) lines.push(`- Newly triggered: ${id}.`);
    const still = inv.triggeredRules.map((r: Json) => `${r.ruleId} ${r.name}`);
    if (still.length) lines.push(`Still unexplained: ${still.join("; ")}.`);
    for (const m of inv.mitigations) lines.push(`- ${m.id} ${m.name} (${m.weight}): ${m.explanation}`);
    lines.push(a.summary);
    return lines.join("\n");
  }

  private describePeer(peer: Json, verbose: boolean): string {
    const lines: string[] = [];
    if (peer.matches.length) {
      const strongest = peer.matches[0];
      lines.push(
        `**Cross-home check:** ${peer.matches.length} matching indicator(s) from another synthetic home. Strongest: ${strongest.strength} match on ${strongest.matchedOn.join(" + ")} (${strongest.indicator.patternCode}, ${strongest.indicator.severity}, observed hour ${strongest.indicator.observedHour}). Score adjustment +${peer.scoreAdjustment}; updated score ${pct(peer.updatedAssessment.score)}, ${CLASS_LABEL[peer.updatedAssessment.classification]}.`,
      );
    } else {
      lines.push(`**Cross-home check:** no other home has reported a matching indicator (${peer.peerIndicatorsVisible} peer indicator(s) compared). That is not evidence of safety.`);
    }
    if (verbose) {
      lines.push(`Only compact indicators (${peer.sharedFields.length} fields: pattern code, keyed device token, severity, hour bucket) were compared. Raw events, occupancy, device names and exact times stayed in the home. ${peer.publishNote}`);
    } else {
      lines.push(peer.publishNote);
    }
    return lines.join("\n");
  }

  private describeProposal(res: Json, refreshed: boolean): string {
    if (res.status === "not_needed") return `**Response:** ${res.reason}`;
    const p = res.proposal;
    return [
      `**Proposed response${refreshed ? " (updated for the new assessment)" : ""}** ${p.proposalId}. All actions are simulated, and nothing is recorded until you confirm:`,
      ...p.actions.map((a: Json) => `- ${a.label}. _${a.rationale}_`),
      "Use **Review & confirm** to approve or cancel.",
    ].join("\n");
  }

  private describeWhy(conv: Conversation): string {
    const inv = conv.investigation;
    if (!inv) return "There is no investigation yet.";
    const a = inv.assessment;
    const lines = [`**Why ${CLASS_LABEL[a.classification]}:** the score is a sum of fixed rule weights, not a probability.`];
    for (const r of inv.triggeredRules) lines.push(`- ${r.ruleId} (+${r.weight}) from events ${r.evidenceEventIds.join(", ")}: ${r.explanation}`);
    for (const n of inv.notTriggered) lines.push(`- ${n.ruleId} not triggered: ${n.reason}`);
    if (conv.peer?.scoreAdjustment) lines.push(`- Peer intelligence (+${conv.peer.scoreAdjustment}).`);
    lines.push(`Uncertainty is ${a.uncertainty.level}. ${a.uncertainty.factors.join(" ")}`);
    return lines.join("\n");
  }

  private describeTimeline(conv: Conversation): string {
    const inv = conv.investigation;
    if (!inv) return "There is no investigation yet.";
    return ["**Timeline:**", ...inv.timeline.map((e: Json) => `- ${e.localTime} ${e.summary}${e.ruleIds.length ? ` [${e.ruleIds.join(", ")}]` : ""}`)].join("\n");
  }

  private suggestions(conv: Conversation): string[] {
    const s: string[] = [];
    if (!conv.investigation) {
      s.push("Investigate the repeated front-door activity while nobody was home. Does the evidence suggest a security concern, has another home seen a similar pattern, and what should I do?");
      s.push("Investigate this window.");
      return s;
    }
    s.push("Why do you think that?");
    if (conv.assumptions.occupancy !== "home") s.push("What if the owner was actually home?");
    if (conv.assumptions.occupancy) s.push("Go back to the recorded presence data.");
    if (!conv.peer) s.push("Has another home seen a similar pattern?");
    if (!conv.proposal || conv.proposal.status !== "pending") s.push("What should I do?");
    s.push("Show the timeline.");
    return s;
  }

  private finish(conv: Conversation, userText: string | null, reply: string, intents: string[], steps: ToolStep[]): TurnResult {
    const at = new Date().toISOString();
    if (userText) conv.messages.push({ role: "user", text: userText, at });
    conv.messages.push({ role: "assistant", text: reply, at, steps });
    const { messages: _m, proposal, ...rest } = conv;
    // The confirmation code stays server-side; the UI confirms by proposalId via an explicit click.
    const safeProposal = proposal ? (({ confirmationCode: _c, ...p }) => p)(proposal) : null;
    return {
      conversationId: conv.id,
      reply,
      intents,
      steps: redact(steps),
      suggestions: this.suggestions(conv),
      state: { ...rest, proposal: safeProposal },
      mcp: this.mcpInfo(),
    };
  }
}

function redact(steps: ToolStep[]): ToolStep[] {
  return JSON.parse(JSON.stringify(steps), (k, v) => (k === "confirmationCode" && typeof v === "string" ? "(held server-side)" : v));
}
