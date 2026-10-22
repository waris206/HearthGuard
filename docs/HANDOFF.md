# HearthGuard handoff report (2026-10-22, ~05:25 UTC)

## 1. What I found
* **I could not access `github.com/waris206/HearthGuard`.** Attaching it failed with "link your GitHub account". I did **not** inspect, preserve or modify anything in the existing repo, its history, branches or config.
* Official rules (fetched 2026-10-22). Deadline **Oct 23, 2026, 12:00 PM PDT**. The Alexa+ track accepts a self-hosted MCP server on spec **2025-11-25+ over Streamable HTTP** that is actually called at runtime. Video under 3 min and public. Repo either public with an OSS license, or private and shared with the Amazon reviewer accounts listed on the rules page.
* Environment: Node 22.22, npm 10.9, tmux, Chromium for Playwright. No API keys used or needed.

## 2. What I built (a fresh standalone git repo, 4 local commits on `main`)
* `server/`: the official MCP TS SDK 1.32.1 server with 4 tools (`get_home_context`, `investigate_events`, `check_peer_intelligence`, `prepare_response`). It's stateless Streamable HTTP at `POST /mcp`, with zod input and output schemas and structured error codes.
  * Deterministic risk engine (rules HG-R1–R6, mitigation HG-M1). Evidence event ids, uncertainty factors, a heuristic score that is labelled as not a probability, and three classifications.
  * Two synthetic homes, six scenarios (normal / suspicious / ambiguous, plus Home B seed and follow-up).
  * Cross-home store that accepts only an 8-field indicator (strict schema, HMAC tokens, hour buckets). It never matches a home with itself and never publishes what-if revisions.
  * Two-step, human-confirmed simulated response with proposal id + confirmation code. Stale proposals are superseded.
  * Conversational orchestrator that is a **real MCP client** over HTTP. It does keyword intents (no LLM), what-if follow-ups on the same incident, and confirm/cancel.
* `web/`: React + Vite + Tailwind console with scenario picker, home overview, chat with expandable real tool-call logs, risk assessment, evidence cards that highlight timeline events, timeline, peer-intel shared vs never-shared view, response panel + confirm dialog, incident history, and loading/empty/error states. Responsive down to 390 px.
* Docs: `README.md`, `LICENSE` (MIT), `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION_CHECKLIST.md`, `docs/PRODUCT_FEEDBACK.md` (draft friction log).

## 3. Verified (I ran each of these and saw it pass)
| Check | Result |
|---|---|
| `npm test` | 5 files, **33/33 passed**. Covers engine scenarios, privacy boundary, confirmation gate, MCP integration via the SDK client, and orchestrator via REST. |
| Negotiated protocol | `2025-11-25` (asserted in tests, `npm run smoke`, raw curl `initialize`) |
| MCP Inspector CLI 2.12.0 | `tools/list` returned the 4 tools; `tools/call investigate_events` returned score 30 / inconclusive for the ambiguous scenario |
| `npm run typecheck` | exit 0 (server + web) |
| `npm run build` | server compiled; web bundle 178 kB JS / 23 kB CSS |
| `npm run e2e` (Playwright, headless Chromium) | **PASSED**: investigate → 98/100 + peer match → what-if 48/100 → revert → confirm dialog → recorded; Home B escalates via Home A's indicator; normal = no concern; no overflow at 390 px; no console errors |
| Clean clone (`git clone` → `npm ci` → typecheck → build → test → e2e) | all passed |
| `npm audit --omit=dev` | 0 vulnerabilities in runtime deps |

## 4. How to run
```bash
# from the repo root
npm install
npm run build
npm start                 # http://127.0.0.1:8787 (UI), POST /mcp (MCP)
# dev mode instead: npm run dev  → http://localhost:5173
npm test                  # unit + integration
npm run smoke             # with the server running
npm run e2e               # after build; screenshots in e2e-screenshots/
```

## 5. tmux
In this cloud container a production server runs in tmux session `hearthguard` on :8787 (`npm start`, log in `.runtime/server.log`). The container is temporary, so this goes away when the session ends.
```bash
tmux attach -t hearthguard          # detach: Ctrl-b d
tail -f .runtime/server.log
tmux kill-session -t hearthguard    # stop
```

## 6. Git
* Branch `main`, 4 local commits, working tree clean. **Nothing was pushed.** There is no remote.
* Copies in project files: `hearthguard/HearthGuard.bundle` (full git history) and `hearthguard/HearthGuard-source.zip`, plus 4 UI screenshots.
* To bring it into your repo (it has unrelated history, so check for conflicts first):
```bash
git clone https://github.com/waris206/HearthGuard.git && cd HearthGuard
git fetch /path/to/HearthGuard.bundle main:hearthguard-build
git checkout hearthguard-build          # inspect; then merge into main:
git checkout main && git merge --allow-unrelated-histories hearthguard-build
```

## 7. Outstanding / unverified
* Existing repo not inspected (blocked). Possible conflicts when merging.
* **Not tested with Alexa+** or any Amazon surface. I haven't registered the MCP server anywhere, and it isn't publicly hosted. No auth on `/mcp` (synthetic data only).
* The Devpost submission, video, repo visibility and reviewer-account sharing are all untouched (by design).
* Dev-only dependency advisories (vitest 3 / tinypool, braces via tailwind tooling). Upgrading vitest to v4 hit an npm peer conflict, so I left it alone. Runtime deps are clean.
* The intent parser is keyword-based. Unusual phrasing gets a help reply.

## 8. Your next actions (smallest first)
1. [Connect GitHub](https://claude.ai/connect-github) so I can work in the real repo, **or** merge the bundle yourself (commands above).
2. Choose: public repo (MIT is ready) or private + add the Amazon reviewer accounts from the rules page.
3. Record the video with `docs/DEMO_SCRIPT.md` and upload it publicly.
4. Fill in Devpost: description, repo, video, Alexa+ track, product feedback / friction log (edit `docs/PRODUCT_FEEDBACK.md`).
5. Optional: host the server so judges can reach the MCP endpoint, and add the URL to the testing instructions.

## 9. Demo sequence
Reset demo → Home A "Repeated front-door activity while away" → click the long investigate suggestion → expand "4 MCP tool calls" → hover HG-R4 → show Cross-home panel → "What if the owner was actually home?" (98→48) → "Go back to the recorded presence data." → Review & confirm → Confirm & record → incident history. Optional: Home B "Unrecognised device returns" → "Investigate this window." Full script: `docs/DEMO_SCRIPT.md`.
