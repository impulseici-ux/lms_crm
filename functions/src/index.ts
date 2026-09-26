import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const VALID_ROLES = ["admin", "counsellor", "management"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * Section 18: role is a custom claim on the Auth token, set only by an
 * admin-only Cloud Function — never client-writable. This mirrors the
 * chosen role onto the `users/{uid}` Firestore document too, so the staff
 * directory (dropdowns, staff-performance reports) can be read without a
 * second source of truth drifting out of sync.
 */
export const setUserRole = onCall(async (request) => {
  const callerRole = request.auth?.token?.role;
  if (!request.auth || (callerRole !== "admin" && callerRole !== "superadmin")) {
    throw new HttpsError(
      "permission-denied",
      "Only an admin can change a staff member's role."
    );
  }

  const { uid, role, displayName, branchId, active } = request.data as {
    uid?: string;
    role?: Role;
    displayName?: string;
    branchId?: string | null;
    active?: boolean;
  };

  if (!uid || !role || !VALID_ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `uid and a valid role (${VALID_ROLES.join(", ")}) are required.`
    );
  }

  await getAuth().setCustomUserClaims(uid, { role });

  await getFirestore()
    .collection("users")
    .doc(uid)
    .set(
      {
        role,
        ...(displayName !== undefined ? { displayName } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
        active: active ?? true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return { ok: true };
});

/**
 * Phase 2 (Section 12) — NOT wired into any Phase 1 UI or workflow.
 * Kept here, documented and disabled-by-default (requires WEBSITE_WEBHOOK_SECRET
 * to be configured), so the target integration shape matches the blueprint
 * exactly and Phase 2 doesn't need a data-model change to adopt it: it
 * creates a lead through the same `leads` collection, same pipeline, as
 * every Phase 1 manually-typed lead.
 */
const websiteWebhookSecret = defineSecret("WEBSITE_WEBHOOK_SECRET");

export const websiteWebhook = onRequest(
  { secrets: [websiteWebhookSecret] },
  async (req, res) => {
    const configuredSecret = websiteWebhookSecret.value();
    if (!configuredSecret) {
      res.status(503).json({ error: "Website webhook is not enabled (Phase 2)." });
      return;
    }
    const provided = req.get("x-webhook-secret");
    if (!provided || provided !== configuredSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = req.body ?? {};
    const parentName = String(body.parentName ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    if (!parentName || !phone) {
      res.status(400).json({ error: "parentName and phone are required" });
      return;
    }

    const now = FieldValue.serverTimestamp();
    const defaultFollowUp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const doc = await getFirestore()
      .collection("leads")
      .add({
        parentName,
        parentPhone: phone,
        parentEmail: body.parentEmail ?? null,
        childName: body.childName ?? null,
        childAge: body.childAge ?? null,
        interestedProgramId: body.programId ?? null,
        sourceChannel: "Website — Enquiry Form",
        campaignId: body.campaignId ?? null,
        utm: {
          source: body.utm_source ?? null,
          medium: body.utm_medium ?? null,
          campaign: body.utm_campaign ?? null,
        },
        status: "New Lead",
        priority: "Medium",
        assignedStaffId: null,
        createdByStaffId: null,
        branchId: body.branchId ?? null,
        nextFollowUpAt: defaultFollowUp,
        lastContactedAt: null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });

    res.status(201).json({ ok: true, leadId: doc.id });
  }
);
