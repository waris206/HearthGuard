# HearthGuard demo script (target: about 2:50, hard limit under 3:00)

The story: suspicious event → explainable evidence → cross-home privacy protection → new context changes the assessment → homeowner-controlled response.

Setup before recording:
1. Run `npm run build`, then `npm start` (two separate commands; Windows PowerShell 5 has no `&&`), then open http://127.0.0.1:8787 in a 1600×1000 window.
2. Click **Reset demo** (top right) so incident ids start clean (Home A's incident becomes INC-0002).
3. Open a terminal next to the browser for the last shot (run the Inspector command once beforehand so `npx` has it cached).
4. Check that the header shows the green chip **MCP 2025-11-25 · hearthguard 1.0.0**.
5. No third-party music or logos (contest rule).

| Time | On screen | Say (roughly) |
|---|---|---|
| 0:00–0:15 | App open on Home A "Repeated front-door activity while away" | "Five wrong keypad codes, a camera dropping offline, the back door opening, all while nobody's home. Separate alerts get ignored, and a chatbot would just guess. HearthGuard investigates them together, from evidence. The homes are synthetic and every action is simulated." |
| 0:15–0:40 | Click the long suggestion ("Investigate the repeated front-door activity…"). Expand **4 MCP tool calls**. | "One question, four real MCP tool calls on the 2025-11-25 spec: home context, investigation, cross-home intelligence, response. Likely security concern, 98 out of 100, and the score is labelled a heuristic, not a probability." |
| 0:40–1:00 | Scroll the right column to **Evidence**. Hover HG-R4 so its events light up in the timeline. | "Each rule separates what the sensors observed from what HearthGuard infers, including the innocent explanation. The back door opened with no unlock while nobody was home." |
| 1:00–1:30 | **Cross-home evidence trail**, steps 1 to 4 | "Step 1: what stays in this home. Twelve raw events, presence, device names, the raw Bluetooth fingerprint. Step 2: all that's shared is three compact indicators, a pattern code, a hashed device token and an hour. Step 3: another home reported the same device token. Step 4: its own rules said 83, the peer match adds 15. And it says plainly: a match is not proof." |
| 1:30–1:45 | Click **See the receiving side: open Home B's scenario**, then **Investigate this window.** Point at steps 3 and 4. | "From Home B's side, Home A's indicator lifts an inconclusive 35 to 50. Because that came from a peer match and not Home B's own evidence, the response is a cautious set. No keypad lockout." |
| 1:45–2:10 | Click Home A's suspicious scenario again, click the long suggestion, then **"What if the owner was actually home?"** Point at the **New context changed the assessment** box. | "New context matters. If the owner was home, the back-door and away rules drop out: 98 becomes 48, inconclusive. The failed codes and the unknown device are still unexplained, so the response becomes verification-first: ask the household instead of locking things down." |
| 2:10–2:35 | **"Go back to the recorded presence data."** → **Review & confirm** → read the dialog → **Confirm & record** → incident history | "Back on recorded data, nothing happens until I confirm. The dialog says the actions are simulated. Once I confirm, the decision is recorded on the incident, and if the backend failed the app would say 'Not recorded'." |
| 2:35–2:50 | Terminal: `npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8787/mcp --transport http --method tools/list` showing the four tools | "And it's a standalone, self-hosted MCP server over Streamable HTTP, so any MCP client can call these four tools, not just this console. HearthGuard: investigations, not alarms. Evidence first, data-minimising, homeowner in control." |

Fallback if something breaks on camera: **Reset demo**, re-select the scenario and repeat. All results are deterministic.
