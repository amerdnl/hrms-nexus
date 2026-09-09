import type { LeaveType } from "./leave";

/** The leave types the database accepts, in display order. */
export const leaveTypes: readonly LeaveType[] = [
  "annual", "medical", "emergency", "unpaid",
];
