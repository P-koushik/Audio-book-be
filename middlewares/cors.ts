import type { Request, Response, NextFunction } from "express";

const DEFAULT_ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "ngrok-skip-browser-warning",
].join(", ");

const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].join(", ");

function parseAllowedOrigins(raw: string | undefined): string[] | "*" {
  if (!raw) return ["http://localhost:3000"];
  const trimmed = raw.trim();
  if (trimmed === "*") return "*";
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);
  const requestOrigin = req.headers.origin;

  if (allowedOrigins === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
  res.setHeader(
    "Access-Control-Allow-Headers",
    (req.headers["access-control-request-headers"] as string | undefined) ?? DEFAULT_ALLOWED_HEADERS,
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
}

