# HearthGuard: 2-hour competition-readiness sprint (2026-10-22, 06:36–07:20 UTC)

Same repo, same machine (the working directory was intact, so nothing was restored from the bundle). 3 new local commits, nothing pushed.

## 1. Audit of the earlier claims
| Claim | Verdict |
|---|---|
| Official MCP TS SDK, Streamable HTTP, 2025-11-25 negotiated at runtime | **True.** `server/src/mcp/server.ts` and `app.ts`. Asserted in tests, smoke script and Inspector. |
| UI shows real tool calls | **True.** The UI renders `steps[]` produced by `InvestigationAssistant.call()`, which wraps `client.callTool` over HTTP. |
| Logical sequence that uses tool results | **True.** It branches on classification (normal skips the peer check and the response). |
| Follow-ups keep context and change the assessment | **True.** Same incident, new revision, diff shown (98 → 48). |
| Explainable findings | **Partly.** Observation and inference were mixed in one sentence. **Fixed.** |
| No raw history crosses homes | **True.** Strict 8-field schema with tests. |
| Confirmation enforced | **True in the backend.** **But the UI posted a "✔ Confirmed" chat line before the request returned**, so a failed request still looked like success. **Fixed.** |
| Clean start with documented commands | **True.** Clean clone → `npm ci`, typecheck, build, 46 tests, e2e, smoke all pass. |

## 2. Three highest-impact weaknesses found, all fixed
1. **Browser-borne attacks on the unauthenticated server.** `/mcp` and `/api` accepted any `Origin`. A `text/plain` cross-site POST from any web page could reset the demo (verified: HTTP 200). Binding `0.0.0.0` only printed a warning. **Fix:** Origin validation, JSON-only API, a refusal to bind publicly without `HG_ALLOWED_HOSTS`, CSP and nosniff/frame-deny headers, generic 500s, and a cap on in-memory conversations. (`server/src/security.ts`, `index.ts`, `app.ts`)
2. **Over-assertive outputs for judges.** Rules blended fact with inference. Peer matches didn't say "not proof". The what-if (inconclusive) still proposed disabling the keypad. **Fix:** each rule now has `explanation` (observed) and `inference` (including the benign alternative). Matches carry an `interpretation` plus a disclaimer. Responses are proportional ("Protective set" vs "Verification-first set"), and next steps agree with them.
3. **Failure paths.** The UI could show success on a failed decision, and a hung MCP server stalled for 60 s because `connect()` ignored the per-call timeout. **Fix:** the UI only reports what the backend recorded (the dialog stays open with "Not recorded: …"). There's now a 10 s timeout on connect and on each tool call.

## 3. Tests: 33 → 46, all passing (plus a bigger e2e)
New tests target gaps only:
* `hardening.test.ts`: cross-origin `/mcp` → 403 while same-origin, dev UI and CLI are allowed; a cross-site `text/plain` or foreign-Origin reset is blocked and no state changes; security headers present; public bind refused (spawns the server); `__proto__`, 5000-char and invalid-enum inputs rejected with no side effects; oversized chat rejected; a hung MCP server times out with nothing fabricated.
* `engine.test.ts`: every normal fixture in both homes stays no-concern with low uncertainty; a peer match can't create a concern with no rules fired; observation text contains no inference wording.
* `response.test.ts`: a likely concern gets the keypad action, while inconclusive or what-if proposals don't; next steps agree.
* `privacy.test.ts`: match wording is correlation, not proof; adjustment ≤ 15.
* `scripts/e2e.mjs`: intercepts a 500 on the decision endpoint and asserts no success is shown, the dialog stays open and the proposal stays pending. It then confirms for real. It also checks the Observed/Inferred labels, the "not proof" text and the proportionality text.

Verified commands (run from a clean clone): `npm ci` ✓, `npm run typecheck` ✓, `npm run build` ✓, `npm test` 46/46 ✓, `npm run e2e` PASSED ✓, `npm run smoke` (negotiated 2025-11-25) ✓, `npm audit --omit=dev` 0 vulnerabilities ✓. I also spot-checked MCP Inspector CLI 2.12.0 `tools/call` and checked that dev mode (`npm run dev` through the Vite proxy) still works with the Origin guard.

## 4. Docs
* `docs/FRICTION_LOG.md`: 7 entries, each reproduced or observed during the build, with tool, steps, expected, actual, impact, the workaround in the repo, and a suggestion. **There are no Amazon-tool entries because no Amazon tool was used.** The friction-log bonus may count for less unless you add Alexa+ experience.
* `docs/PRODUCT_FEEDBACK.md`: rewritten per tool (what worked, what to improve, onboarding, workarounds, would use again).
* `README.md`: new **Security assumptions** table (risk → mitigation → test), **Built with**, observed vs inferred, proportionality, new env var `HG_ALLOWED_ORIGINS`, test count.
* `docs/DEMO_SCRIPT.md`: updated lines for the Observed/Inferred labels, the "not proof" wording and the verification-first what-if response. Still under 3 minutes.

## 5. Running now
tmux session `hearthguard` serves http://127.0.0.1:8787 (`tmux attach -t hearthguard`; log in `server.log`; stop with `tmux kill-session -t hearthguard`). The container is temporary, so use the bundle.

## 6. Git
`main`, 7 commits (3 new: `88cfbe2`, `aae1e05`, plus this handoff), clean tree, not pushed. Updated `HearthGuard.bundle` and source zip are in project files `hearthguard/`.

## 7. Still open (your actions)
1. [Connect GitHub](https://claude.ai/connect-github) or merge the bundle into `waris206/HearthGuard`. The existing repo is still uninspected.
2. Make the repo public (MIT included) or share it with the Amazon reviewer accounts on the rules page.
3. Record the video (`docs/DEMO_SCRIPT.md`). Fill in Devpost, using `PRODUCT_FEEDBACK.md` and `FRICTION_LOG.md`.
4. Not done and not verified: Alexa+ registration or testing, public hosting, authentication. If you host it for judges, set `HG_ALLOWED_HOSTS` and keep it up only as long as needed.
5. Dev-only dependency advisories remain (vitest 3 / tinypool, tailwind tooling). Runtime deps are clean.
