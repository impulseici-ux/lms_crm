import type { VercelRequest, VercelResponse } from "@vercel/node";

// The CRM frontend is static-hosted on Firebase Hosting, a different origin
// from this Vercel deployment, so every response needs CORS headers. Kept as
// an explicit allowlist (rather than "*") since these endpoints accept
// activation codes and passwords.
const ALLOWED_ORIGINS = [
  "https://littlemillennium-crm.web.app",
  "https://littlemillennium-crm.firebaseapp.com",
  "https://littlemillennium-crm-prod.web.app",
  "https://littlemillennium-crm-prod.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5199",
];

/** Applies CORS headers and handles the OPTIONS preflight. Returns true if the caller should stop (preflight handled). */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
