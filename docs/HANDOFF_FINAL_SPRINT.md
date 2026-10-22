# HearthGuard: final 60-minute sprint handoff (2026-10-22, 07:52–08:35 UTC)

## Starting state (checked, not assumed)
* The cloud working copy was at `bb261cb`, with a clean tree. That's the same commit as GitHub `main`: I confirmed earlier from your PC that `origin/main` = `bb261cb` and it's the only branch.
* Cloud GitHub access still fails (`add_repo`: "link your GitHub account"), so I can't push from here.
* Baseline: `npm test` 46/46 passed, `npm run build` passed, `npm run e2e` passed.

## 1. Biggest weakness and why it mattered
The **cross-home intelligence** is HearthGuard's main differentiator, but in the UI it only appeared as two lists of field names and a JSON dump. A judge couldn't see:
1. what Home A observed and kept local,
2. which indicators were actually shared,
3. how a match changed the score compared with the home's own rules,
4. what the receiving home sees.

It also had a substantive gap. At Home B, a peer match on its own pushed the score from 35 to 50 ("likely concern"), and the app then proposed **disabling the keypad**. That treats a match as proof, which contradicts our own "not proof" message. This hits the Design and Quality-of-idea criteria directly.

## 2. What changed (commit `2a7fe9e`)
* `web/src/components/CrossHome.tsx` (new): **Cross-home evidence trail**, built only from real tool output.
  ① Stays local: counts of raw events, presence, device names, access-code labels and the raw Bluetooth fingerprint.
  ② The exact compact indicators shared, in plain language plus the code. During a what-if it says "for comparison only (what-if is never published)".
  ③ What other homes reported, with match strength.
  ④ Own-rules score vs score with peer intelligence, plus the "not proof" statement.
  There's also a **"See the receiving side"** button that opens the other synthetic home's scenario (a real scenario switch).
* `web/src/components/Insights.tsx`: a **"New context changed the assessment"** before/after box (score and classification, rules dropped, what's still unexplained). The old PeerPanel is removed.
* `web/src/components/Chat.tsx`: the chat log scrolls itself to the newest message without moving the page.
* `server/src/service/hearthguard.ts`: `check_peer_intelligence` now also returns `assessmentBeforePeer`. A concern reached **only because of a peer match** now gets a **"Cautious set"** with no keypad disable.
* `server/src/engine/riskEngine.ts`: next steps follow the same rule (no "disable keypad" advice unless the home's own evidence supports it).
* Tests: `server/test/privacy.test.ts` checks before/after peer values (35 → 50, delta = adjustment). `server/test/response.test.ts` checks a peer-only concern gets a cautious set with no keypad advice. `scripts/e2e.mjs` checks the trail shows the 12 local events and 3 indicators, no raw data in the shared cards, 83 vs 98, the context box (98 / 48 / HG-R2), Home B 35 vs 50, and the "Cautious set".
* `docs/DEMO_SCRIPT.md` (rewritten in the new order) and `README.md` (trail, three response tiers, 48 tests).

## 3. Scenario now demonstrated
1. Home A, "Repeated front-door activity while away": ask the long question → 4 real MCP tool calls → likely concern, 98 (83 from rules, +15 peer).
2. Evidence cards: Observed vs Inferred; hovering highlights timeline events.
3. Cross-home trail: what stays local → 3 shared indicators → strong matches from the other home → 83 vs 98, "not proof".
4. "See the receiving side" → Home B → investigate → its own rules give 35 (inconclusive), Home A's indicator gives 50 → **Cautious set** (no keypad lockout).
5. Back on Home A: "What if the owner was actually home?" → before/after box 98 → 48, inconclusive; R2 and R4 dropped; verification-first response.
6. "Go back to the recorded presence data." → Review & confirm → the dialog says actions are simulated → Confirm & record → recorded in incident history. (The e2e also proves a failed request shows "Not recorded".)

## 4. Commands and results (all from a fresh clone of `2a7fe9e`)
| Command | Result |
|---|---|
| `npm ci` | passed |
| `npm run typecheck` | passed |
| `npm run build` | passed |
| `npm test` | **48/48 passed** |
| `npm run e2e` (headless Chromium, full story incl. failure injection, mobile width) | **PASSED** |
| `npm start` + `npm run smoke` | passed, negotiated `2025-11-25` |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Junk/secret scan of tracked files | clean |
| Live Alexa+ / Echo test | **not run** (no integration exists) |

## 5. Simulated vs implemented vs missing
* **Implemented:** MCP server (official SDK, Streamable HTTP, 4 tools), deterministic rules engine, incident revisions, indicator derivation/matching with strict schema, two-step confirmation, an orchestrator that is a real MCP client, the web UI, and security hardening.
* **Simulated:** both homes and all events (JSON fixtures), the other home (same process, shared in-memory store), and every protective action (recorded only).
* **Missing:** Alexa+ registration and testing, public hosting, authentication, live event ingestion.

## 6. GitHub
**GitHub does not have this commit yet.** `main` there is still `bb261cb`. The new work is one fast-forward commit on top. The updated bundle is at `C:\Users\hp\Downloads\ctf\HearthGuard-final.bundle` (if copying it to your PC worked) and in project files as `hearthguard/HearthGuard.bundle`. To push:
```
cd C:\Users\hp\Downloads\ctf\HearthGuard-repo
git fetch ..\HearthGuard-final.bundle main:final-sprint
git checkout main && git pull
git merge --ff-only final-sprint
git push origin main
```
Afterwards `git rev-parse origin/main` should print the sprint commit (`2a7fe9e…`, or the handoff commit on top of it).

## 7. Blockers before recording and submitting
1. The push above.
2. Repo access for judges: public (MIT is in place) or shared with the Amazon reviewer accounts on the rules page. Your decision.
3. The video, Devpost fields and track selection.

## 8. Honest assessment by criterion
* **Technical implementation: strongest.** Real MCP server and client, verified protocol negotiation, a multi-step workflow that branches on tool results, 48 tests plus an e2e with failure injection. Weakness: no Alexa+ runtime, so the track fit rests on "self-hosted MCP server" alone.
* **Quality of idea: strong.** Cross-home indicator sharing with explicit "not proof" handling and proportional, human-confirmed responses is more distinctive than a chatbot. It's now visible on screen.
* **Design: good, but dense.** The UI is consistent and self-explanatory, but there's a lot of text. The video has to guide the eye (the script does).
* **Potential impact: weakest.** Everything is synthetic, with no real device data or user validation, so impact is argued, not shown.
No win is promised, and I haven't estimated a probability.

## 9. The single most important action
Push the commit (section 6), then record the video with `docs/DEMO_SCRIPT.md`. The cross-home trail moment at 1:00–1:45 is the part that sets HearthGuard apart.
