import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * FIREBASE_SERVICE_ACCOUNT_KEY: the full JSON contents of a Firebase Admin
 * SDK service-account key, set as a Vercel environment variable (never
 * committed). Reused as-is per environment (dev/prod) — see backend/README.md.
 */
function getApp() {
  const existing = getApps();
  if (existing.length) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not configured on this Vercel deployment.");
  }
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }
  return initializeApp({ credential: cert(serviceAccount as never) });
}

export function auth() {
  return getAuth(getApp());
}

export function db() {
  return getFirestore(getApp());
}
