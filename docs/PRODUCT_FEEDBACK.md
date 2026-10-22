# Product feedback (for the Devpost form). Edit it into your own words.

Based only on what happened while building HearthGuard. Detailed evidence for each issue is in [FRICTION_LOG.md](FRICTION_LOG.md).

## Tools actually used

| Tool | Version | Used for |
|---|---|---|
| MCP TypeScript SDK (`@modelcontextprotocol/sdk`) | 1.32.1 | MCP server (4 tools, Streamable HTTP, protocol 2025-11-25) **and** the orchestrator's MCP client |
| MCP Inspector CLI | 2.12.0 | Independent check of tools/list and tools/call |
| zod | 4.6.7 | Tool input/output schemas, fixture validation, REST validation |
| Express | 4.22 | HTTP server for /mcp, /api and the built UI |
| React 18 + Vite 7 + Tailwind CSS 3 | | Web console |
| Vitest 3, Playwright 1.64 (headless Chromium) | | 46 unit/integration tests, end-to-end demo test |
| Node.js | 22.22 | Runtime |

**Not used:** Alexa Skills Kit, the Alexa+ developer tooling, Ring, Bee, Fire TV and AWS. We have no first-hand feedback on Amazon tools. If you do register the MCP server with Alexa+ before submitting, add that experience here.

## MCP TypeScript SDK

* **What worked:** `registerTool` with zod schemas is concise and gives validated inputs plus `structuredContent`. The stateless Streamable HTTP pattern (fresh server and transport per POST, JSON responses) was simple to run and test. Protocol `2025-11-25` negotiated with no configuration, and `transport.protocolVersion` made it easy to assert in tests. Using the same SDK as a client let the app's orchestrator make real tool calls.
* **What needs improvement:** zod 4 closed-object output schemas silently become `additionalProperties: false` and break clients (friction #1). The Express helper validates Host but not Origin (#3) and only warns on public binds (#4). The connect/initialize timeout is separate from per-call timeouts (#5).
* **Onboarding:** the bundled examples (`dist/esm/examples/server/simpleStatelessStreamableHttp.js`) were the fastest way in. The security items above were found by probing, not from docs.
* **Workarounds used:** `z.looseObject()`, our own Origin guard and JSON-only middleware, refusing public binds without an allowlist, and `connect(transport, { timeout })`.
* **Would we use it again?** Yes. Once the schema and security defaults were understood, the SDK did everything needed.

## MCP Inspector CLI

* **What worked:** `--cli --transport http --method tools/call --tool-arg k=v` checked a running server in one command, no code needed.
* **Needs improvement:** the `--strict` portability warnings flag the SDK's own recommended open-object output (friction #2).
* **Would we use it again?** Yes, as a quick independent check.
