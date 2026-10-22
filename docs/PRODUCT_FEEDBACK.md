# Product feedback and friction log (draft, edit before submitting)

These are real issues hit while building HearthGuard on 2026-10-22.

## MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.1)

**What worked well**
* `McpServer.registerTool` with zod input and output schemas gives validated `structuredContent` and JSON Schema in `tools/list` with very little code.
* The stateless Streamable HTTP pattern (fresh server and transport per POST, `sessionIdGenerator: undefined`, `enableJsonResponse: true`) was easy to test with plain HTTP.
* `createMcpExpressApp()` adds Host-header validation for localhost binds by default, which is a sensible security default.
* Negotiation of `2025-11-25` worked out of the box between the SDK client and server. `transport.protocolVersion` makes it easy to assert in tests.

**Friction**
1. *Open vs closed output schemas.* With zod v4, a plain `z.object()` output schema is emitted to clients as `additionalProperties: false`. The SDK client then rejected any tool result that had extra documented fields ("data must NOT have additional properties"). Switching to `z.looseObject()` fixed it, but MCP Inspector's `--strict` portability check then warns that `additionalProperties: {}` "constrains nothing". The docs should say which pattern is recommended for partially specified outputs.
2. Error results (`isError: true`) skip output-schema validation, which is right. But the convention for machine-readable error codes inside `content` isn't documented, so we put JSON in a text block.
3. Built-in input-validation errors come back as plain-text `isError` results, not a JSON-RPC `-32602` error. That's fine, but it surprised us; clients have to parse text.

## MCP Inspector CLI (2.12.0)
* `--cli ... --transport http --method tools/call --tool-arg k=v` was a fast way to verify a remote server without writing a client.
* The schema portability warnings are useful, but they conflict with the SDK behaviour in friction item 1 above.

## Vite / @vitejs/plugin-react
* `npm i vite@6 @vitejs/plugin-react` failed with ERESOLVE because the latest plugin needs Vite 8. Pinning `@vitejs/plugin-react@4` worked, but it pulled a second Vite (7.x) and its types clashed in `vite.config.ts`. Aligning on `vite@7` fixed it.

## Testing note
* Node's `fetch` silently ignores a custom `Host` header, so DNS-rebinding protection has to be tested with `node:http`.
