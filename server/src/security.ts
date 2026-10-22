// Small HTTP hardening for a local demo server. HearthGuard has no authentication, so these
// guards stop the two practical browser-borne attacks: cross-site requests (CSRF / a web page
// talking to a localhost MCP server) and DNS rebinding (Host validation lives in createMcpExpressApp).
import type { NextFunction, Request, Response } from "express";

export const DEFAULT_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/**
 * MCP Streamable HTTP servers must validate Origin. Requests without Origin (CLI/SDK clients)
 * pass; browser requests must be same-origin or explicitly allowed.
 */
export function originGuard(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((o) => o.toLowerCase().replace(/\/$/, "")));
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* malformed Origin, rejected below */
    }
    if ((host && host === req.headers.host) || allowed.has(origin.toLowerCase())) return next();
    res.status(403).json({ jsonrpc: "2.0", error: { code: -32000, message: "Forbidden: cross-origin request rejected." }, id: null });
  };
}

/** Rejects non-JSON bodies on state-changing API calls (text/plain is a CSRF-capable "simple" request). */
export function requireJson(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") return next();
  if (!req.is("application/json")) return res.status(415).json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use Content-Type: application/json." } });
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  next();
}

export const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
