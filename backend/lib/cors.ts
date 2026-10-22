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
  // The dedicated frontend's short custom-style Vercel domain — doesn't end in
  // "-impulseici-uxs-projects.vercel.app" like every other deployment URL below,
  // so the suffix match doesn't catch it; listed explicitly instead.
  "https://littlemillenniumsinganallurcrm.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5199",
];

// Every Preview/Production deployment under this Vercel team is served at a
// "*-impulseici-uxs-projects.vercel.app" subdomain (confirmed across every
// project in this account, not guessed) — covers the new lms-crm-web
// frontend project and every future preview hash without re-editing this
// allowlist per-deployment. Scoped to this exact team suffix, not "*".
const ALLOWED_ORIGIN_SUFFIX = "-impulseici-uxs-projects.vercel.app";

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || (origin.startsWith("https://") && origin.endsWith(ALLOWED_ORIGIN_SUFFIX));
}

/** Applies CORS headers and handles the OPTIONS preflight. Returns true if the caller should stop (preflight handled). */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
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
