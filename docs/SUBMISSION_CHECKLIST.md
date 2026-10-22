# Submission checklist and Devpost field drafts

Rules re-checked on 2026-10-22 at https://amazonappdev2026.devpost.com/rules. The Devpost manage page needs a login, so the field list below is Devpost's standard project form plus the questions the rules require. Match it to what your form actually shows.

**Deadline: Oct 23, 2026, 12:00 PM PDT** (Oct 24, 00:00 PKT). After that the submission can't be edited.

## 1. Requirements → status

| Requirement (from the rules) | Status |
|---|---|
| Alexa+ track: self-hosted MCP server, spec 2025-11-25+, Streamable HTTP | **Done.** Negotiates `2025-11-25` (integration tests, `npm run smoke`, MCP Inspector CLI). |
| Required tech imported and called at runtime, not just in the README | **Done.** SDK server in `server/src/mcp/server.ts`; the console's orchestrator is a real SDK client (`server/src/assistant/assistant.ts`). |
| Stage 1: fits the theme, reasonably uses the required tech | **Done**, as long as the video shows the MCP tool calls (it does, plus a closing Inspector shot). |
| Repo has all source, assets, setup and run instructions | **Done.** README quick start; no keys, no paid services. GitHub `main` = `0bcffa1` plus this checklist commit once pushed. |
| Repo access: public + OSS license visible in About, **or** private + the 5 Amazon reviewers as collaborators | **Akash.** See section 2. |
| Video under 3 min, public on YouTube/Vimeo, shows it working, no third-party trademarks or unlicensed music | **Akash.** Script: `docs/DEMO_SCRIPT.md` (about 2:50). |
| Text description of features and functionality | **Draft ready** (section 3). |
| Track and mini-challenge declaration | **Akash.** Alexa+; Open Source only if the repo is public (section 2). |
| Product feedback for each tool, API or SDK used (what for, what worked, what needs work, onboarding, would you use it again) | **Draft ready.** `docs/PRODUCT_FEEDBACK.md` covers every tool used. |
| Friction log (optional, up to +10%): task, steps, expected vs actual, severity, workaround, suggestion | **Done.** `docs/FRICTION_LOG.md`: 7 entries, every field filled, all verified. None are Amazon tools, because none were used. |
| Free for judges to test through Nov 20 | **Done** for local runs (MIT, no keys). No hosted instance. |
| English materials | Done. |
| New project built in the submission period | Done. The whole git history is dated 2026-10-22. |

## 2. Decisions only Akash can make

1. **Repo access.** Pick one:
   * **Public** (recommended). MIT is already in `LICENSE`, and GitHub shows it in the About box automatically. Making it public also makes HearthGuard eligible for the **Open Source mini challenge** ($5,000 + $5,000 AWS credits), which asks for a new open-source project made during the hackathon. A project can win one track prize and one mini-challenge prize.
   * **Private.** Settings → Collaborators → Add people: `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`. Do not declare Open Source in this case.
2. **AWS Builder mini challenge: don't declare it.** No AWS service is used.
3. **Run it once on your own PC before recording.** Every check so far ran on Linux; Windows hasn't been tried.

## 3. Devpost fields (copy, then edit into your own voice)

**Project name:** HearthGuard

**Elevator pitch (under 200 characters):**
> A self-hosted MCP server that investigates smart-home security events like an analyst: explainable rules, data-minimising cross-home indicators, and human-confirmed responses.

**About the project** (Devpost accepts Markdown):

```markdown
## Inspiration
Smart-home owners get a stream of separate alerts: "incorrect code", "camera offline", "back door opened". Each is easy to ignore. Together they might be a break-in, or the dog walker running late. Assistants today either stay quiet or raise a generic alarm. We wanted an assistant that investigates: what happened, in what order, what matters, what is still uncertain, and what to do.

## What it does
HearthGuard is a self-hosted MCP server (spec 2025-11-25, Streamable HTTP) with four tools that an assistant such as Alexa+ could call:

1. `get_home_context`: devices, household members, access-code schedules, sharing settings and who was home.
2. `investigate_events`: rebuilds the timeline and runs six transparent rules plus one mitigation rule. Each rule separates what the sensors observed from what HearthGuard infers, cites the exact events, and lists rules that did not fire and why. It returns a heuristic score, explicitly not a probability, and supports what-if revisions ("what if the owner was home?").
3. `check_peer_intelligence`: shares only compact indicators with other homes (a pattern code, a keyed-hash device token, severity and an hour bucket: 8 fields, schema-enforced). Raw events, presence, device names and exact times never leave the home. A match raises the score but is labelled "not proof of compromise".
4. `prepare_response`: proposes protective actions proportional to the evidence and records nothing until the homeowner confirms with a one-time code. A concern reached only through a peer match gets a cautious set (no lockouts); an inconclusive one gets verification-first steps.

A web console shows the whole thing: one question triggers four real MCP tool calls; evidence cards highlight their events on the timeline; a cross-home evidence trail shows what stayed local, the exact indicators shared, and the score with and without the peer match; and a before/after box shows how new context changed the assessment.

The demo runs on two synthetic households. Every action is simulated and recorded only.

## How we built it
TypeScript end to end. The server uses the official MCP TypeScript SDK (stateless Streamable HTTP, zod input/output schemas) on Express. The console's orchestrator is itself an MCP client, so every step on screen is a real `tools/call`. The deterministic engine and indicator sharing are plain TypeScript with no LLM, so results are reproducible and the demo needs no paid API. React, Vite and Tailwind for the UI. 48 Vitest tests (including a real MCP client over HTTP) and a Playwright end-to-end run of the full story, including a forced backend failure and a phone-width layout.

## Challenges we ran into
- zod 4 closed output schemas made the SDK client reject every tool result until we switched to open schemas.
- The SDK's Express helper checks Host but not Origin, so we added our own Origin guard, JSON-only APIs and a refusal to bind publicly without a host allowlist.
- Making peer intelligence useful without overclaiming: a match alone now never triggers a lockout.
Details are in our friction log.

## Accomplishments that we're proud of
- Every claim on screen traces to a tool result and specific events.
- The privacy boundary is enforced in code and tested: a strict 8-field indicator schema, what-if data never published, a home never matching itself.
- The homeowner stays in control: two-step confirmation, and the UI only reports what the backend actually recorded.

## What we learned
Explaining uncertainty matters as much as the score. Separating observation from inference, and saying what the system cannot tell, made the output more trustworthy. On MCP, output-schema strictness and transport security defaults deserve attention early.

## What's next
Register the MCP server with Alexa+ and test it with real voice requests, add authentication for hosted deployments, ingest live events from real devices, and validate the rules and the sharing model with real households.

## Honest scope
HearthGuard has not been registered with or tested on Alexa+, Echo or Ring, and it is not an Amazon product. All data is synthetic, all actions are simulated, and the score is a rule-based heuristic.
```

**Built with:** `typescript`, `node.js`, `model-context-protocol`, `mcp-typescript-sdk`, `express`, `zod`, `react`, `vite`, `tailwindcss`, `vitest`, `playwright`

**Try it out:** https://github.com/waris206/HearthGuard

**Video demo link:** your YouTube or Vimeo URL (check that it plays logged out).

**Image gallery:** `02b-cross-home.png`, `03-whatif.png`, `04-confirm-dialog.png` and `06-home-b.png` from `npm run e2e` (written to `e2e-screenshots/`).

**Track:** Alexa+. **Mini challenge:** Open Source, only if the repo is public.

**Testing instructions:**
> No login, no API keys, no paid services. Requires Node.js 20.19+.
> `git clone https://github.com/waris206/HearthGuard && cd HearthGuard`, then `npm install`, `npm run build`, `npm start`, and open http://127.0.0.1:8787.
> Pick "Repeated front-door activity while away" and click the first suggested question. The MCP endpoint is `POST http://127.0.0.1:8787/mcp`. Check it with `npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8787/mcp --transport http --method tools/list`, or run `npm run smoke` while the server is up. `npm test` runs 48 tests.
> The server binds to loopback only, by design: it is unauthenticated. All data is synthetic and every action is simulated.

**Product feedback:** paste `docs/PRODUCT_FEEDBACK.md` (drop its first line).

**Friction log:** paste `docs/FRICTION_LOG.md`, or link it: https://github.com/waris206/HearthGuard/blob/main/docs/FRICTION_LOG.md

## 4. Claims to avoid anywhere

* Don't say it runs on Alexa+, Echo or Ring, or that it is integrated with Amazon devices.
* Don't say "privacy-preserving" without "data-minimising" and "synthetic demo". There is no formal privacy guarantee.
* Don't call the score a probability or say "AI detects intrusions". It's deterministic rules.
