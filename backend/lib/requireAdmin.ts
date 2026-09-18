import type { VercelRequest } from "@vercel/node";
import { auth } from "./firebaseAdmin";

/** Verifies the caller's Firebase ID token and that its `role` custom claim is admin. Throws on failure. */
export async function requireAdmin(req: VercelRequest): Promise<{ uid: string }> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing Authorization header.");

  const decoded = await auth()
    .verifyIdToken(token)
    .catch(() => {
      throw new HttpError(401, "Invalid or expired session.");
    });

  if (decoded.role !== "admin") {
    throw new HttpError(403, "Only an admin can do this.");
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
