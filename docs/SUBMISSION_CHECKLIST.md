# Submission checklist (Amazon Developer Hackathon 2026, Alexa+ track)

Rules checked on 2026-10-22 at https://amazonappdev2026.devpost.com/rules. Re-check before submitting.

Deadline: **Oct 23, 2026, 12:00 PM PDT** (Oct 24, 00:00 PKT).

## Requirements → status

| Requirement | Status |
|---|---|
| Alexa+ track: self-hosted MCP server, spec 2025-11-25+ over Streamable HTTP | Done locally. Negotiates `2025-11-25` (tests + MCP Inspector CLI + `npm run smoke`). |
| Technology imported and actually called at runtime | Done. `@modelcontextprotocol/sdk` server in `server/src/mcp/server.ts`, client in `server/src/assistant/assistant.ts`. |
| Project stays free and accessible to judges through judging | **Open.** Decide on hosting or local run instructions (see below). |
| Repo: public + OSS license (shown in About), OR private and shared with the Amazon reviewer accounts listed on the rules page | **Open (Akash).** MIT LICENSE is included. Code has not been pushed yet. |
| Repo has all source, assets, setup/run instructions | Done (README). |
| Demo video under 3 min, public on YouTube/Vimeo, shows the project running, no unlicensed music or trademarks | **Open (Akash).** Script in `docs/DEMO_SCRIPT.md`. |
| Text description | **Open (Akash).** Start from the README intro. |
| Product feedback for each tool/SDK used | Draft in `docs/PRODUCT_FEEDBACK.md`. Review and edit it. |
| Friction log (optional, up to 10% bonus) | Draft in `docs/PRODUCT_FEEDBACK.md`. |
| Track selection: Alexa+ | **Open (Akash)** on Devpost. |

## Steps for Akash, in order

1. Connect GitHub to Claude (https://claude.ai/connect-github) **or** push this local repo yourself (see the handoff report for the commands).
2. Merge into `waris206/HearthGuard`. The existing repo contents were not inspected, so check for conflicts.
3. Pick a repo option: make it public (the MIT license is already present) or share it with the Amazon reviewer accounts listed on the rules page.
4. Record the video with `docs/DEMO_SCRIPT.md`, upload it as Public or Unlisted-public on YouTube, and check that it plays logged out.
5. Fill in the Devpost fields: description, video URL, repo URL, track, product feedback, friction log.
6. Optional: expose the MCP endpoint for judges (e.g. `HG_HOST=0.0.0.0 HG_ALLOWED_HOSTS=<host> npm start` behind a tunnel or a free host) and put the URL in the testing instructions.

## Claims to avoid in Devpost text

* Don't say it runs on Alexa+, Echo or Ring, or that it is integrated with Amazon devices. It hasn't been registered with or tested on Alexa+.
* Don't claim "privacy-preserving" without the qualifier "data-minimising, local synthetic demo". There's no formal privacy guarantee.
* Don't call the score a probability or say "AI detects intrusions". It's deterministic rules.
