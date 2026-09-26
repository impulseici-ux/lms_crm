import type { VercelRequest } from "@vercel/node";
import { auth } from "./firebaseAdmin";

async function verifyCaller(req: VercelRequest) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing Authorization header.");

  return auth()
    .verifyIdToken(token)
    .catch(() => {
      throw new HttpError(401, "Invalid or expired session.");
    });
}

/** Verifies the caller's Firebase ID token and that its `role` custom claim is admin or superadmin (a superadmin can do everything an admin can, plus user deletion). Throws on failure. */
export async function requireAdmin(req: VercelRequest): Promise<{ uid: string }> {
  const decoded = await verifyCaller(req);
  if (decoded.role !== "admin" && decoded.role !== "superadmin") {
    throw new HttpError(403, "Only an admin can do this.");
  }
  return { uid: decoded.uid };
}

/** Stricter than requireAdmin — for destructive actions (permanent user deletion) reserved for the superadmin tier only. */
export async function requireSuperAdmin(req: VercelRequest): Promise<{ uid: string }> {
  const decoded = await verifyCaller(req);
  if (decoded.role !== "superadmin") {
    throw new HttpError(403, "Only a superadmin can do this.");
  }
  return { uid: decoded.uid };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
