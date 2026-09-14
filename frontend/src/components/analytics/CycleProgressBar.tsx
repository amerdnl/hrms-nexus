import type { CycleProgress } from "../../types/analytics";
import { reviewStatusMeta } from "../performance/reviewMeta";
import SegmentedBar from "../ui/SegmentedBar";

/** Where each review in a cycle stands, in the same words the review pages use. */
export default function CycleProgressBar({ cycle }: { cycle: CycleProgress }) {
  return (
    <SegmentedBar
      title={`${cycle.name}: where each review stands`}
      unit={cycle.participants === 1 ? "person" : "people"}
      segments={[
        { key: "pending_self", value: cycle.pendingSelf, ...reviewStatusMeta("pending_self") },
        { key: "pending_manager", value: cycle.pendingManager, ...reviewStatusMeta("pending_manager") },
        { key: "completed", value: cycle.completed, ...reviewStatusMeta("completed") },
      ]}
    />
  );
}
