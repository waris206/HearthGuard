# HearthGuard friction log

Every entry below is something we actually hit while building HearthGuard on 2026-10-22. The workaround listed is the one that is in the repo and covered by a test or a check we ran. Severity is how much it affected *this* project.

**Scope note.** HearthGuard uses no Amazon developer tool, SDK or API. It doesn't call Alexa+, ASK, Ring or AWS APIs, and its MCP server has not been registered with Alexa+. So there are **no verified Amazon-specific entries**. Every entry concerns the MCP TypeScript SDK and the surrounding open-source toolchain.

| # | Tool | Summary | Severity |
|---|---|---|---|
| 1 | MCP TS SDK 1.32.1 + zod 4 | Closed `z.object()` output schemas make the SDK client reject valid tool results | High (broke every tool call) |
| 2 | MCP Inspector CLI 2.12.0 | `--strict` flags the working fix for #1 as "constrains nothing" | Low |
| 3 | MCP TS SDK 1.32.1 | `createMcpExpressApp()` validates Host but not Origin, so cross-origin browser requests reach `/mcp` | Medium (security) |
| 4 | MCP TS SDK 1.32.1 | Binding to `0.0.0.0` only logs a warning for an unauthenticated server | Medium (security) |
| 5 | MCP TS SDK 1.32.1 | A per-call `timeout` does not cover `client.connect()`; initialize waits up to 60 s | Medium (reliability) |
| 6 | Vite / @vitejs/plugin-react | Latest plugin requires Vite 8; pinning it pulled a second Vite and broke config types | Low |
| 7 | Node.js 22 `fetch` | A custom `Host` header is silently ignored, so DNS-rebinding tests pass vacuously | Low |

---

### 1. Closed output schemas break structured tool results
* **Tool:** `@modelcontextprotocol/sdk` 1.32.1 (`McpServer.registerTool` with `outputSchema`), zod 4.6.7.
* **Task:** declare output schemas that list the guaranteed fields of each tool result while returning more documented fields (timeline, notTriggered, changes, and so on).
* **Steps:** used `outputSchema: z.object({...})` for the guaranteed fields, then called the tools with the SDK `Client` over Streamable HTTP in `server/test/mcp.integration.test.ts`.
* **Expected:** a partial object schema validates the listed fields and lets extra fields through. That's the JSON Schema default, and it's how zod's `parse` treats unknown keys (it strips them instead of failing).
* **Actual:** the client failed every call with `MCP error -32602: Structured content does not match the tool's output schema: data must NOT have additional properties, ... data/devices/0 must NOT have additional properties, ...`. The published schema carried `additionalProperties: false`.
* **Impact:** high. All four tools were unusable from a real client until fixed, and nothing in the server-side registration warned about it.
* **Workaround (in repo):** `z.looseObject({...})` for every output schema (`server/src/mcp/server.ts`). The integration tests and MCP Inspector `tools/call` then passed.
* **Suggestion:** document in the SDK README that zod 4 `z.object()` output schemas are emitted as closed objects, and recommend `z.looseObject()` for partially specified results. Or warn at registration time when a closed output schema is used.

### 2. Inspector's portability check flags the fix for #1
* **Tool:** MCP Inspector CLI 2.12.0 (`npx @modelcontextprotocol/inspector --cli <url> --transport http --method tools/list --strict`).
* **Expected:** `z.looseObject()` output (`additionalProperties: {}`) is accepted as the way to allow extra fields.
* **Actual:** 16 warnings such as `Path: outputSchema.properties.home.additionalProperties — Schema carries no validation keyword at all, so it accepts any value`. The suggestion is to write `{"type":"object","additionalProperties":true}`, which zod does not emit.
* **Impact:** low. They're warnings only, and tools/list and tools/call work.
* **Workaround:** none needed. We kept `looseObject` and recorded the warnings.
* **Suggestion:** treat `additionalProperties: {}` as equivalent to `true` in the portability check, or have the SDK emit `true`.

### 3. Origin header is not validated by the Express helper
* **Tool:** `createMcpExpressApp()` from `@modelcontextprotocol/sdk/server/express.js`.
* **Steps:** started the server on 127.0.0.1 and sent `POST /mcp` (tools/list) with `Origin: https://evil.example` and a valid Host. Also sent `POST /api/reset` with `Content-Type: text/plain` from that Origin.
* **Expected:** the helper that adds DNS-rebinding protection would also reject foreign `Origin` headers. The MCP Streamable HTTP transport guidance says servers must validate `Origin`.
* **Actual:** HTTP 200 for both. The `text/plain` reset is a CORS "simple request", so any web page the user visited could have wiped the demo state.
* **Impact:** medium for a local unauthenticated server.
* **Workaround (in repo):** `originGuard()` in `server/src/security.ts` (allows same-origin, the Vite dev origin, and requests with no Origin from CLI/SDK clients), plus `requireJson` on the REST API. Covered by `server/test/hardening.test.ts`. We did not try the transport-level `allowedOrigins` option.
* **Suggestion:** have `createMcpExpressApp()` validate `Origin` by default (same-origin plus an `allowedOrigins` option), the same way it already validates Host.

### 4. Public bind of an unauthenticated server is only a warning
* **Tool:** `createMcpExpressApp({ host: "0.0.0.0" })`.
* **Actual:** prints `Warning: Server is binding to 0.0.0.0 without DNS rebinding protection...` and serves anyway.
* **Impact:** medium. It's easy to expose a no-auth MCP server by setting one environment variable.
* **Workaround (in repo):** `server/src/index.ts` refuses to start on a non-loopback host unless `HG_ALLOWED_HOSTS` is set (tested by spawning the server).
* **Suggestion:** an opt-in flag (e.g. `allowUnprotectedPublicBind`) instead of a warning.

### 5. Connect/initialize ignores the timeout you give tool calls
* **Tool:** SDK `Client` + `StreamableHTTPClientTransport`.
* **Steps:** pointed the assistant at an HTTP server that accepts connections but never responds, with `callTool(..., { timeout: 300 })`.
* **Expected:** the conversation fails fast.
* **Actual:** our 5 s test timed out. `client.connect()` sends `initialize` with the default `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000`, and a per-call timeout doesn't apply to it.
* **Impact:** medium. The UI would spin for a minute on a hung server.
* **Workaround (in repo):** `client.connect(transport, { timeout })` in `server/src/assistant/assistant.ts`. The test now completes in under 5 s with a clean failure message.
* **Suggestion:** mention the connect-time timeout in the client docs, or offer a client-level default timeout option.

### 6. Vite plugin peer range and duplicate Vite types
* **Tool:** npm 10.9, `vite`, `@vitejs/plugin-react`.
* **Actual:** `npm i -D vite@6 @vitejs/plugin-react` gave `ERESOLVE ... peer vite@"^8.0.0" from @vitejs/plugin-react@6.1.2`. Pinning `@vitejs/plugin-react@4` installed, but it brought its own `vite@7.3.7`, and `tsc` then failed on `vite.config.ts` with a long `HotUpdatePluginContext` / `MinimalPluginContext` type mismatch.
* **Workaround (in repo):** use `vite@7.3.7` everywhere (one deduped copy) and keep `vite.config.ts` out of the app tsconfig.
* **Suggestion:** clearer peer-range errors that name the newest compatible plugin version.

### 7. `fetch` drops custom Host headers
* **Tool:** Node.js 22.22 global `fetch` (undici).
* **Actual:** a test sending `host: evil.example` through `fetch` got 200 because the header was replaced. The Host protection looked broken when it wasn't being exercised at all.
* **Workaround (in repo):** use `node:http` `request()` for that test (`server/test/mcp.integration.test.ts`).
* **Suggestion:** a dev-mode warning when a forbidden header is set and dropped.
