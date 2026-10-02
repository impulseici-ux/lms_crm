import type { LeadDoc } from "@/types";

// A missing `viewed` field (leads created before this feature shipped) counts
// as viewed, so old leads never start blinking.
export function isLeadUnseen(lead: LeadDoc): boolean {
  return lead.viewed === false;
}
