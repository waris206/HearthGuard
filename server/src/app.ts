import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { listHomes } from "./domain/fixtures.js";
import { createMcpServer } from "./mcp/server.js";
import { HearthGuardService } from "./service/hearthguard.js";
import { InvestigationAssistant } from "./assistant/assistant.js";

export interface AppOptions {
  service: HearthGuardService;
  assistant: InvestigationAssistant;
  host?: string;
  allowedHosts?: string[];
  webDist?: string;
}

const here = dirname(fileURLToPath(import.meta.url));

export function createApp({ service, assistant, host = "127.0.0.1", allowedHosts, webDist = join(here, "..", "..", "web", "dist") }: AppOptions) {
  // Includes Host-header validation (DNS-rebinding protection) for localhost binds.
  const app = createMcpExpressApp({ host, allowedHosts });

  // ---- MCP: Streamable HTTP, stateless (a fresh server+transport per request; state lives in the service) ----
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer(service);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  const notAllowed = (_req: Request, res: Response) =>
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: POST only)." }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  // ---- REST API for the web UI ----
  const api = express.Router();
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => async (req: Request, res: Response) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: { code: "INVALID_INPUT", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      const message = e instanceof Error ? e.message : String(e);
      res.status(/Unknown conversation/.test(message) ? 404 : 500).json({ error: { code: "ERROR", message } });
    }
  };

  api.get("/health", wrap(() => ({ ok: true, mcp: assistant.mcpInfo() })));
  api.get(
    "/homes",
    wrap(() =>
      listHomes().map((h) => ({
        id: h.id,
        name: h.name,
        scenarios: h.scenarios.map((s) => ({ id: s.id, title: s.title, description: s.description, expected: s.expected })),
      })),
    ),
  );
  api.get("/incidents", wrap(() => service.listIncidents()));
  api.get("/incidents/:id", wrap((req) => service.getIncident(String(req.params.id))));
  api.get("/peer-store", wrap(() => service.peerStore.all()));
  api.post(
    "/reset",
    wrap(() => {
      service.reset();
      return { ok: true };
    }),
  );
  api.post(
    "/conversations",
    wrap((req) => {
      const body = z.object({ homeId: z.string().min(1), scenarioId: z.string().min(1) }).strict().parse(req.body);
      return assistant.start(body.homeId, body.scenarioId);
    }),
  );
  api.post(
    "/conversations/:id/messages",
    wrap((req) => {
      const body = z.object({ text: z.string().trim().min(1).max(1000) }).strict().parse(req.body);
      return assistant.message(String(req.params.id), body.text);
    }),
  );
  api.post(
    "/conversations/:id/decision",
    wrap((req) => {
      const body = z.object({ proposalId: z.string().min(1), decision: z.enum(["confirm", "cancel"]) }).strict().parse(req.body);
      return assistant.decide(String(req.params.id), body.proposalId, body.decision);
    }),
  );
  app.use("/api", api);

  // ---- Built web UI (production) ----
  if (existsSync(join(webDist, "index.html"))) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api|mcp).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  }
  return app;
}
