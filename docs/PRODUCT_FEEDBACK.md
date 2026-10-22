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
| Vitest 3, Playwright 1.64 (headless Chromium) | | 48 unit/integration tests, end-to-end demo test |
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
* **Onboarding:** zero to a working `tools/list` against our server in one `npx` command.
* **Would we use it again?** Yes, as a quick independent check.

## zod 4

* **Used for:** MCP tool input/output schemas, validating the synthetic home fixtures at load time, and the strict 8-field schema that every shared indicator must pass before it is published.
* **What worked:** one schema gives runtime validation, TypeScript types and the JSON Schema the MCP SDK publishes. A strict object schema (`.strict()`) made the "nothing extra leaves the home" rule enforceable in code and testable.
* **What needs work:** the open/closed object semantics are easy to get wrong when the schema is converted to JSON Schema (friction #1).
* **Onboarding:** quick; the v4 docs covered the API changes we hit.
* **Would we use it again?** Yes.

## Vite + React + Tailwind CSS

* **Used for:** the web investigation console.
* **What worked:** fast dev server with an `/api` and `/mcp` proxy, and a small production build that Express serves.
* **What needs work:** plugin and Vite peer ranges (friction #6).
* **Onboarding:** straightforward once the version pin was sorted.
* **Would we use it again?** Yes.

## Vitest and Playwright

* **Used for:** 48 unit and integration tests (including a real MCP client over HTTP and the security hardening) and a headless-Chromium run of the whole demo story, including a forced backend failure and a phone-width check.
* **What worked:** Vitest needed no config for TypeScript ESM. Playwright drove the built app reliably and its screenshots doubled as demo assets.
* **What needs work:** nothing blocking. Node's `fetch` dropping a custom Host header (friction #7) made one security test pass vacuously until we switched to `node:http`.
* **Onboarding:** both worked with their defaults; Playwright used the preinstalled Chromium.
* **Would we use it again?** Yes.
