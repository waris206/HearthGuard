# HearthGuard demo script (target: 2:45, hard limit under 3:00)

Setup before recording:
1. `npm run build && npm start`, open http://127.0.0.1:8787 in a 1600×1000 window.
2. Click **Reset demo** (top right) so incident ids start clean.
3. Make sure the header shows the green chip **MCP 2025-11-25 · hearthguard 1.0.0**.
4. No third-party music or logos in the recording (contest rule).

| Time | On screen | Say (roughly) |
|---|---|---|
| 0:00–0:15 | App with Home A "Repeated front-door activity while away" selected | "Smart homes fire separate alerts: a wrong code, a camera dropping, a door opening. HearthGuard investigates them together and shows its evidence. Everything you'll see is synthetic, and every action is simulated." |
| 0:15–0:25 | Point at the MCP chip and the left panel (occupancy: both residents away) | "HearthGuard is an MCP server on the 2025-11-25 spec over Streamable HTTP. This console is an MCP client calling its four tools." |
| 0:25–0:55 | Click the first suggestion (the long "Investigate the repeated front-door activity…" question). Expand **4 MCP tool calls**. | "One question, four real tool calls: home context, investigation, peer intelligence, response. Five rules fired. Five wrong codes in five minutes, an unrecognised Bluetooth device, the porch camera going offline, then the back door opening with no unlock while nobody was home." |
| 0:55–1:15 | Hover the HG-R4 evidence card so its events highlight in the timeline | "Each rule points to the exact events behind it. The score is a heuristic, and the app says plainly it isn't a probability. It also lists what it can't tell: the camera footage is missing." |
| 1:15–1:40 | Scroll to **Cross-home intelligence**: matches, Shared vs Never shared | "Another synthetic home reported the same device token and pattern last night. Only eight compact fields were compared: a pattern code, a keyed hash of the device, severity and an hour bucket. Home A's timeline, occupancy and device names never leave the home." |
| 1:40–2:05 | Click suggestion **"What if the owner was actually home?"** | "Follow-ups keep the incident context. If the owner was home, the back-door rule and the away rule drop out and the score falls from 98 to 48, now inconclusive. Five failed codes and an unknown device still aren't explained, and HearthGuard says that." |
| 2:05–2:15 | Click **"Go back to the recorded presence data."** | "Back to the real sensor data." |
| 2:15–2:40 | **Review & confirm**, read the dialog, click **Confirm & record**. Show the incident history entry. | "Nothing happens without me. The response is simulated and only recorded after I confirm. HearthGuard never touches real locks." |
| 2:40–2:50 | Optional: pick Home B "Unrecognised device returns", click "Investigate this window." | "And now Home B benefits: Home A's indicator pushes Home B's inconclusive probe to a likely concern." |
| 2:50 | End on the full screen | "HearthGuard: investigations, not alarms." |

Fallback if something breaks on camera: **Reset demo**, re-select the scenario, and repeat. All results are deterministic.
