import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";

// Deliberately a local, standalone type rather than importing from web/src/types —
// this backend project deploys from Root Directory = backend (see README.md) and
// can't reach outside it at build time. Only the statuses a status webhook can ever
// report are listed; the full WhatsAppMessageStatus union lives in web/src/types/whatsapp.ts.
type InboundWhatsAppStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";

// Vercel parses JSON bodies by default, which discards the exact bytes the
// signature in X-Hub-Signature-256 was computed over. Read the raw body
// ourselves so verification can actually succeed.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

// Meta's WhatsApp Cloud API status strings -> this CRM's own WhatsAppMessageStatus.
// "deleted" has no equivalent here and is ignored.
const STATUS_MAP: Record<string, InboundWhatsAppStatus | undefined> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

interface MetaStatusUpdate {
  id: string; // the provider message id (wamid) this CRM stored as providerMessageId
  status: string;
  timestamp?: string;
  errors?: { title?: string; message?: string }[];
}

interface MetaInboundMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

async function applyStatusUpdate(update: MetaStatusUpdate) {
  const mapped = STATUS_MAP[update.status];
  if (!mapped) return; // e.g. "deleted" — nothing in our schema to update

  const snap = await db().collection("whatsappMessages").where("providerMessageId", "==", update.id).limit(1).get();
  if (snap.empty) {
    // Nothing to update yet — most likely a status for a message sent before
    // MetaWhatsAppProvider existed, or from a different WABA/app. Not an error.
    console.warn(`whatsapp-webhook: no message found for providerMessageId=${update.id}`);
    return;
  }

  const docRef = snap.docs[0].ref;
  const errorText = update.errors?.[0] ? `${update.errors[0].title ?? "Error"}: ${update.errors[0].message ?? ""}`.trim() : null;

  await docRef.update({
    status: mapped,
    error: mapped === "FAILED" ? errorText : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await docRef.collection("events").add({ status: mapped, note: errorText, at: FieldValue.serverTimestamp() });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ---- Verification handshake (Meta calls this once, when you click "Verify and save") ----
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && expectedToken && token === expectedToken) {
      res.status(200).send(String(challenge ?? ""));
      return;
    }
    res.status(403).send("Forbidden");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  // ---- Real event delivery (message status updates, inbound messages) ----
  const rawBody = await readRawBody(req);
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    if (!isValidSignature(rawBody, req.headers["x-hub-signature-256"] as string | undefined, appSecret)) {
      res.status(403).json({ error: "Invalid signature." });
      return;
    }
  } else {
    console.warn("whatsapp-webhook: WHATSAPP_APP_SECRET is not configured — skipping signature verification.");
  }

  // Meta requires a fast 200 regardless of how processing goes, or it will
  // eventually disable the subscription — so every error below is caught and
  // logged, never thrown back to the caller.
  try {
    const payload = JSON.parse(rawBody.toString("utf8"));
    const changes = payload?.entry?.flatMap((e: { changes?: unknown[] }) => e.changes ?? []) ?? [];

    for (const change of changes) {
      const value = (change as { value?: { statuses?: MetaStatusUpdate[]; messages?: MetaInboundMessage[] } })?.value;
      if (!value) continue;

      for (const status of value.statuses ?? []) {
        await applyStatusUpdate(status).catch((err) => console.error("whatsapp-webhook: status update failed", err));
      }

      // Inbound replies from parents — this CRM doesn't have a two-way chat
      // inbox yet, so these are only logged for now. Revisit when that's built.
      for (const message of value.messages ?? []) {
        console.log(`whatsapp-webhook: inbound message from ${message.from}:`, message.text?.body ?? `[${message.type}]`);
      }
    }
  } catch (err) {
    console.error("whatsapp-webhook: failed to process payload", err);
  }

  res.status(200).json({ received: true });
}
