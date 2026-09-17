// Default Google Sheet column → sync-row field mapping for the Meta Ads lead sync
// (scripts/sync-google-sheets-leads.mjs). Matched case-insensitively against the
// sheet's header row, same technique as HEADER_ALIASES in
// web/src/components/ImportLeadsModal.tsx.
//
// Covers both a raw Meta Lead Ads export (spaced headers like "Full Name") and
// the snake_case shape a Zapier/Make Google Sheets connector typically produces
// (e.g. "full_name", "phone_number") — this project's actual sheet is the latter,
// plus its own custom lead-form questions ("how_old_is_your_child?" etc.).
//
// This is a *default* — an admin can override/extend it without touching code by
// setting `columnMapping` on the integrations/googleSheetsSync Firestore doc
// (fetched at the top of the sync script and merged over these defaults).
export const DEFAULT_HEADER_ALIASES = {
  id: "externalLeadId",
  "lead id": "externalLeadId",
  leadgen_id: "externalLeadId",
  "leadgen id": "externalLeadId",
  "meta lead id": "externalLeadId",

  created_time: "createdTime",
  "created time": "createdTime",
  "created at": "createdTime",
  "submission time": "createdTime",

  full_name: "parentName",
  "full name": "parentName",
  name: "parentName",
  "parent name": "parentName",

  phone_number: "parentPhone",
  "phone number": "parentPhone",
  phone: "parentPhone",
  mobile: "parentPhone",

  email: "parentEmail",
  "email address": "parentEmail",

  child_name: "childName",
  "child name": "childName",
  "child's name": "childName",
  "student name": "childName",

  "how_old_is_your_child?": "childAge",
  child_age: "childAge",
  "child age": "childAge",
  "student age": "childAge",

  "which_program_are_you_interested_in?": "program",
  program: "program",
  course: "program",

  "how_would_you_like_to_proceed?": "notes",
  notes: "notes",
  remarks: "notes",

  campaign_name: "campaignName",
  "campaign name": "campaignName",
  campaign: "campaignName",

  adset_name: "adSetName",
  "ad set name": "adSetName",
  "ad_set_name": "adSetName",

  ad_name: "adName",
  "ad name": "adName",

  form_name: "formName",
  "form name": "formName",

  platform: "platform",

  source: "source",

  location: "location",
  city: "location",

  // Present in some exports but not currently mapped to a CRM field — listed
  // here (as no-ops, i.e. left out of the object) intentionally so a future
  // reader knows they were considered: ad_id, adset_id, campaign_id, form_id,
  // is_organic, lead_status.
};

/** Normalize a raw sheet header cell to its canonical field key, or null if unmapped. */
export function resolveHeader(rawHeader, overrides) {
  const key = String(rawHeader ?? "").trim().toLowerCase();
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return DEFAULT_HEADER_ALIASES[key] ?? null;
}
