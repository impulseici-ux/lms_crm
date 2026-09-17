import type { Timestamp } from "firebase/firestore";
import { isOpenStatus, type LeadStatus } from "@/types";

/**
 * Section 6 guardrail: "an open lead cannot be saved without a next
 * follow-up date, unless it's being moved into a closed status." Checked
 * client-side for immediate UX feedback; also enforced in firestore.rules
 * as the real backstop.
 */
export function assertFollowUpGuardrail(
  status: LeadStatus,
  nextFollowUpAt: Timestamp | null | undefined
): void {
  if (isOpenStatus(status) && !nextFollowUpAt) {
    throw new Error(
      "This lead is open and needs a next follow-up date before it can be saved."
    );
  }
}
