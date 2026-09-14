import { Award } from "lucide-react";
import { useEffect, useState } from "react";
import { getRecognition } from "../../api/recognitionApi";
import type { RecognitionItem } from "../../types/recognition";
import LinkButton from "../ui/LinkButton";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import RecognitionEntry from "./RecognitionEntry";

/** The latest recognition you received, on your dashboard. */
export default function RecentRecognitionCard() {
  const [items, setItems] = useState<RecognitionItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getRecognition("received", 1, 2)
      .then((feed) => {
        setItems(feed.items);
        setTotal(feed.total);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <SectionCard
      title="Recognition"
      description={items ? (total === 0 ? "Nothing received yet." : `${total} received.`) : undefined}
      icon={Award}
      actions={<LinkButton to="/recognition" variant="link" size="sm">Recognition</LinkButton>}
    >
      {failed ? (
        <p className="text-sm text-fg-muted">Recognition could not be loaded.</p>
      ) : !items ? (
        <SkeletonText lines={2} />
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted">When a colleague thanks you, it appears here.</p>
      ) : (
        <ul className="-my-4 divide-y divide-line">
          {items.map((item) => <li key={item.id}><RecognitionEntry item={item} compact /></li>)}
        </ul>
      )}
    </SectionCard>
  );
}
