// Default Google Sheet column → sync-row field mapping for the Meta Ads lead sync
// (scripts/sync-google-sheets-leads.mjs). Matched case-insensitively against the
// sheet's header row, same technique as HEADER_ALIASES in
// web/src/components/ImportLeadsModal.tsx.
//
// This is a *default* — an admin can override/extend it without touching code by
// setting `columnMapping` on the integrations/googleSheetsSync Firestore doc
// (fetched at the top of the sync script and merged over these defaults).
export const DEFAULT_HEADER_ALIASES = {
  "lead id": "externalLeadId",
  "leadgen id": "externalLeadId",
  "meta lead id": "externalLeadId",
  "ad id": "externalLeadId",

  "created time": "createdTime",
  "created at": "createdTime",
  "submission time": "createdTime",

  "full name": "parentName",
  name: "parentName",
  "parent name": "parentName",

  "phone number": "parentPhone",
  phone: "parentPhone",
  "phone_number": "parentPhone",
  mobile: "parentPhone",

  email: "parentEmail",
  "email address": "parentEmail",

  "child name": "childName",
  "child's name": "childName",
  "student name": "childName",

  "child age": "childAge",
  "student age": "childAge",

  "campaign name": "campaignName",
  campaign: "campaignName",

  "ad set name": "adSetName",
  adset_name: "adSetName",

  "ad name": "adName",

  "form name": "formName",
  "form_name": "formName",

  platform: "platform",

  source: "source",

  location: "location",
  city: "location",
};

/** Normalize a raw sheet header cell to its canonical field key, or null if unmapped. */
export function resolveHeader(rawHeader, overrides) {
  const key = String(rawHeader ?? "").trim().toLowerCase();
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return DEFAULT_HEADER_ALIASES[key] ?? null;
}
