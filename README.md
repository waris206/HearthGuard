# HearthGuard

**Evidence-driven smart-home security investigations, served as an MCP server.**

HearthGuard looks into suspicious smart-home activity the way a security analyst would. It pulls the home's context, rebuilds the event timeline, runs transparent behavioural rules, and checks compact threat indicators that another (synthetic) home shared. Then it explains what it found, including what it can't tell. Last, it prepares a protective response that only gets recorded after the human confirms it.

> **Everything here is a local, synthetic demonstration.** The two households, their devices and their events are JSON fixtures. Every "protective action" is simulated and recorded only. HearthGuard does not connect to real homes, locks, cameras, Ring, Alexa or Echo devices, and it is not an Amazon product.

Built for the *Build, Ship, Shape: Amazon Developer Hackathon 2026*, Alexa+ track. That track accepts a self-hosted MCP server that implements MCP spec 2025-11-25 or later over Streamable HTTP.

---

## The problem

Smart-home owners get a stream of separate alerts: "incorrect code", "camera offline", "back door opened". Any one of them is easy to wave off. Together they may be a break-in, or they may be the dog walker running late. Most assistants either stay silent or raise a generic alarm. What's missing is an investigation: what happened, in what order, which signals matter, what's still uncertain, and what to do about it.

Example request:

> *"Investigate the repeated front-door activity while nobody was home. Does the evidence suggest a security concern, has another home seen a similar pattern, and what should I do?"*

## What HearthGuard does

| Step | MCP tool | What happens |
|---|---|---|
| 1 | `get_home_context` | Device inventory, members, access-code labels and schedules, sharing settings, and the selected window's occupancy. |
| 2 | `investigate_events` | Rebuilds the timeline, runs deterministic rules HG-R1 to HG-R6 and mitigation HG-M1, and returns observed facts, triggered rules with evidence event ids, rules that did not fire and why, uncertainty, and a heuristic score. Supports what-if revisions on the same incident. |
| 3 | `check_peer_intelligence` | Derives **compact indicators** (pattern code, keyed-hash device token, severity, hour bucket), compares them with indicators shared by *other* homes, and publishes this home's indicators. Raw data never leaves the home. |
| 4 | `prepare_response` | Two-step, human-confirmed. `propose` builds simulated actions from the evidence and records nothing. `confirm` / `cancel` (with the proposal id and a confirmation code) records the user's decision in the incident history. |

The web UI is a conversational investigation console. Every assistant turn shows the real MCP `tools/call` steps it made: arguments, duration, and structured results.

---

## Quick start

Requirements: Node.js 20.19+ (tested on 22.22). No API keys, no paid services.

```bash
npm install          # installs both workspaces (server, web)
npm run build        # compiles the server and builds the web UI
npm start            # serves UI + REST API + MCP on http://127.0.0.1:8787
```

Open http://127.0.0.1:8787. The MCP endpoint is `POST http://127.0.0.1:8787/mcp`.

Development mode with hot reload (server on :8787, Vite on :5173 with a proxy):

```bash
npm run dev          # then open http://localhost:5173
```

### Tests and checks

```bash
npm test             # 46 unit + integration tests (vitest), incl. real MCP client over HTTP and security hardening
npm run typecheck    # server + web TypeScript
npm run build && npm run e2e   # headless-Chromium end-to-end demo run (Playwright), screenshots in e2e-screenshots/
npm run smoke        # with the server running: SDK client smoke test of all four tools
MCP_URL=https://your-host/mcp npm run smoke   # same, against a deployed server
```

With MCP Inspector:

```bash
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8787/mcp --transport http --method tools/list
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8787/mcp --transport http \
  --method tools/call --tool-name investigate_events --tool-arg homeId=home-a --tool-arg scenarioId=a-suspicious-front-door
```

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `HG_HOST` | `127.0.0.1` | Bind address. Localhost binds get Host-header (DNS-rebinding) protection. |
| `HG_ALLOWED_HOSTS` | (unset) | Comma-separated Host names to accept when exposed, e.g. `my-tunnel.example.com`. Loopback stays allowed. **Required** for any non-loopback `HG_HOST`; otherwise the server refuses to start. |
| `HG_ALLOWED_ORIGINS` | (unset) | Extra browser origins allowed to POST to `/mcp` and `/api`. Same-origin and the Vite dev origin (`:5173`) are always allowed. |
| `HG_PERSIST` | on | `0` keeps state in memory only. |
| `HG_STATE_FILE` | `server/.runtime/state.json` | Where incident history and the shared store are persisted. Delete it or use **Reset demo** to start clean. |
| `HG_INDICATOR_KEY` | demo key | HMAC key for indicator tokens. Change it for any non-demo use. |

Exposing the MCP endpoint beyond localhost, for example to try it from an MCP-capable assistant:

```bash
HG_HOST=0.0.0.0 HG_ALLOWED_HOSTS=your-public-hostname npm start
```

There is **no authentication** on the endpoint. It only serves synthetic data and simulated actions, but don't expose it longer than you need to. **The default is loopback-only**, and the server refuses a public bind without an explicit host allowlist.

---

## Architecture

```
┌──────────────── Browser (React + Vite + Tailwind) ────────────────┐
│ scenario picker · chat · timeline · evidence · peer intel ·       │
│ response + confirm dialog · incident history                      │
└──────────────┬────────────────────────────────────────────────────┘
               │ REST /api/conversations/...
┌──────────────▼───────────── Node/Express (one process) ────────────┐
│ InvestigationAssistant  (server/src/assistant)                     │
│   deterministic intent parser + MCP *client* (official TS SDK)     │
│   ── tools/call over Streamable HTTP ──┐                           │
│                                        ▼                           │
│ POST /mcp  MCP server (server/src/mcp) — 4 tools, zod-validated    │
│                                        │                           │
│ HearthGuardService (server/src/service)│ incident history, proposals│
│   ├─ risk engine (server/src/engine)   ─ rules HG-R1..R6, HG-M1    │
│   ├─ peer intel (server/src/intel)     ─ compact indicators, HMAC  │
│   └─ fixtures (server/data/homes/*.json) ─ synthetic Home A / B    │
└────────────────────────────────────────────────────────────────────┘
```

* **The orchestrator is a real MCP client.** The UI never calls the service directly to investigate. It sends a message, and the assistant makes real `tools/call` requests to `/mcp` over HTTP, branches on the structured results, and composes its reply from them. If a tool fails, the reply says so and nothing is filled in.
* **The MCP server is stateless.** Each POST gets a fresh `McpServer` and `StreamableHTTPServerTransport` (JSON responses). State lives in the service, so any MCP client sees the same incidents.
* **No LLM is involved at runtime.** Intent detection is keyword-based, and every number and sentence comes from deterministic code.

### Repository layout

```
server/
  data/homes/home-a.json, home-b.json   synthetic households and scenarios
  src/domain/       types + fixture loading/validation (zod)
  src/engine/       riskEngine.ts: rules, scoring, uncertainty, classification
  src/intel/        peerIntel.ts: indicator derivation, shared store, matching
  src/service/      hearthguard.ts: the four tool operations, incidents, proposals
  src/mcp/          server.ts: MCP tool registration (schemas, annotations, errors)
  src/assistant/    assistant.ts: conversational orchestrator (MCP client)
  src/app.ts        Express: /mcp, /api, static UI
  test/             vitest suites
  scripts/mcp-smoke.ts
web/src/            React UI
scripts/e2e.mjs     Playwright end-to-end run
docs/               demo script, submission checklist, product feedback, friction log, handoffs
```

---

## Behavioural risk engine

The rules are deterministic and fully explained. Each triggered rule names the event ids that triggered it.

| Rule | Fires when | Weight |
|---|---|---|
| HG-R1 Repeated failed access | ≥3 incorrect codes on one lock within 10 min | 20, +4 per extra attempt (max 30) |
| HG-R2 Entry activity while nobody is home | Door open, indoor motion or unlock while no member is present and no valid in-schedule credential explains it | 15 |
| HG-R3 Unrecognised device near an entry | Unknown radio device within 10 min of door activity or failed attempts | 10 |
| HG-R4 Door opened without unlock after failures | An entry opens ≤15 min after the failure cluster, with no unlock in between and nobody home | 25 |
| HG-R5 Camera coverage lost | Camera offline or clip unavailable in the window (also adds uncertainty) | 5 |
| HG-R6 Guest credential outside schedule | Guest code used outside its scheduled window (adds high uncertainty) | 10 |
| HG-M1 Household member present | Door or indoor activity while someone was home (or assumed home) | −10 |
| Peer match | Strongest match only: actor+pattern +15, actor +12, pattern within 72 h +5 | |

* **Observed vs inferred.** Each triggered rule carries `explanation` (what the sensors recorded) and `inference` (what it may mean, including the benign alternative). The UI labels them **Observed** and **Inferred**.
* **Score.** A 0 to 100 sum of rule weights. It is **not a calibrated probability of compromise**, and every output says so.
* **Uncertainty** comes from named factors: missing camera footage, a legitimate credential being involved, sub-threshold failures, no device identifier, hypothetical assumptions.
* **Classification.** `likely_security_concern` needs a score of 50 or more and uncertainty that is not high. `no_concern` needs a score under 20 and uncertainty that is not high. Everything else is `inconclusive`.

## Reproducible scenarios

| Home | Scenario id | Expected | Result (verified by tests) |
|---|---|---|---|
| A | `a-normal-evening` | normal | 0/100, no concern. One typo explained by the resident's own unlock; peer check skipped. |
| A | `a-suspicious-front-door` | suspicious | 83/100 from rules, 98 after the peer match. Likely security concern (R1–R5). |
| A | `a-suspicious-front-door` + "owner was home" | what-if | 48/100, inconclusive. R2 and R4 drop out, M1 applies, and R1/R3 stay unexplained. |
| A | `a-ambiguous-guest-code` | ambiguous | 30/100, inconclusive, **high** uncertainty (guest code 21 min late, clip missing). |
| B | `b-prior-probe` | seed | Investigated automatically at startup. Its derived indicators seed the shared store. |
| B | `b-normal-morning` | normal | 0/100, no concern. |
| B | `b-followup-probe` | suspicious | 35/100 alone (inconclusive). Run Home A's suspicious scenario first and the cross-home match pushes it to 50 (likely concern). |

## Cross-home privacy design

* Only this record shape crosses the home boundary, and it is enforced by a **strict** zod schema at publish time (extra fields are rejected):
  `schemaVersion, indicatorId, sourceHomeToken, patternCode, actorToken, severity, confidence, observedHour`
* Raw radio fingerprints and home ids are replaced with **HMAC-SHA256 tokens** using a shared demo key. Timestamps are reduced to the UTC hour.
* Never shared: timelines, event ids, exact times, occupancy and presence, device names and locations, access-code labels, member identities.
* Every match carries an `interpretation`, and the check returns a disclaimer: a match is a correlation, **not proof of compromise**, and it never identifies anyone. Peer intelligence adds at most +15 and can't create a concern when no rule fired.
* A home never matches its own indicators. **Hypothetical (what-if) revisions are never published.**
* Tests in `server/test/privacy.test.ts` serialise everything Home B can see and assert that none of Home A's raw values appear in it.

**Limits, stated honestly.** This is data minimisation in a single local process, not a privacy guarantee. Anyone with the HMAC key can test guessed fingerprints. Radio identifiers can be randomised or spoofed. Peer indicators are self-reported and unverified. There is no transport encryption between "homes" because there is no network between them, and no differential privacy or other cryptographic protection is implemented.

## Human-controlled response

* `prepare_response(decision="propose")` returns actions marked `simulated: true` and **records nothing**.
* **Proportionality.** A likely concern gets the protective set (including disabling the keypad). An inconclusive assessment gets a verification-first set without disruptive steps. The proposal states which, and the recommended next steps match.
* Recording needs `decision="confirm"` or `"cancel"`, plus the matching `proposalId` **and** `confirmationCode`. Wrong code, unknown proposal, already-decided, or superseded proposals are rejected (tested).
* New evidence (a new revision) **supersedes** pending proposals, so nobody can confirm a stale plan.
* In the UI, confirmation happens only through an explicit dialog click. The confirmation code stays server-side and is redacted from what the browser sees.
* The MCP tool description tells calling assistants to confirm only after the human explicitly agrees. A misbehaving MCP client could still call `confirm` on its own. That's acceptable only because every action is simulated.

---

## What is real and what is simulated

| Real | Simulated / synthetic |
|---|---|
| MCP server (official TS SDK 1.32.1), Streamable HTTP, negotiated protocol **2025-11-25** (verified by tests, MCP Inspector CLI and the smoke script) | Both households, devices, members and events (JSON fixtures) |
| Four tools with zod-validated input, output schemas and structured errors | "Peer homes": both run in the same process and share an in-memory store |
| Deterministic rule engine, uncertainty, classification | Every protective action (recorded only, never executed) |
| Orchestrator making real MCP tool calls; what-if revisions on persistent incidents | Conversational assistant: keyword intents, templated replies (no LLM) |
| Incident history, proposals and decisions persisted to a local JSON file | |

## Security assumptions (local demo)

| Risk | What HearthGuard does | Tested in |
|---|---|---|
| Unintended exposure of the unauthenticated endpoint | Binds `127.0.0.1` by default. Refuses `0.0.0.0` or any non-loopback host unless `HG_ALLOWED_HOSTS` is set. | `hardening.test.ts` |
| DNS rebinding | SDK Host-header validation (403 for foreign Host) | `mcp.integration.test.ts` |
| Cross-site requests from a web page | `Origin` validated on `/mcp` and `/api` (same-origin, dev UI or no Origin only). `/api` POSTs must be `application/json`, which blocks `text/plain` CSRF. | `hardening.test.ts` |
| Malformed or hostile tool arguments | zod schemas with id regexes, length caps and strict objects. Unknown ids give structured errors with no side effects. | `hardening.test.ts`, `mcp.integration.test.ts` |
| Hung or unreachable tools | 10 s timeout on connect and on each tool call. Failures are shown as failures and nothing is fabricated. | `hardening.test.ts`, `assistant.test.ts` |
| Confirmation bypass | Enforced in the backend: proposal id + server-held confirmation code, single decision, superseded on new evidence. The UI never shows success unless the backend recorded it. | `response.test.ts`, `scripts/e2e.mjs` |
| Leaking internals | Generic 500 messages, no `X-Powered-By`, CSP / nosniff / frame-deny headers | `hardening.test.ts` |
| Secrets | None used. No `.env`. The HMAC key is a documented demo default. Git history scanned. | |

## Built with

* **MCP TypeScript SDK 1.32.1** (`@modelcontextprotocol/sdk`): Streamable HTTP server and client, protocol 2025-11-25
* **TypeScript, Node.js 22, Express 4, zod 4**: server, validation, deterministic engine
* **React 18, Vite 7, Tailwind CSS 3**: web console
* **Vitest 3, Playwright 1.64, MCP Inspector CLI 2.12**: testing and verification
* No LLM API, no cloud services, no Amazon SDKs (see [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md))

## Known limitations

* **Not tested with Alexa+ or any Amazon surface.** The server follows the MCP spec version required by the track and was exercised with the official SDK client and MCP Inspector, but registering it with Alexa+ has not been done or verified.
* No authentication on `/mcp` or `/api`. Intended for local or demo use.
* The intent parser is keyword-based. Unusual phrasings fall back to a help message.
* The window and scenario set is fixed. There's no live event ingestion.
* Single process. Peer intelligence is a local simulation, not a networked service.

## License

MIT. See [LICENSE](LICENSE).
