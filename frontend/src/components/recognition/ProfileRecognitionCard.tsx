import { Award, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getPersonRecognition } from "../../api/recognitionApi";
import { useAuth } from "../../context/useAuth";
import type { ProfileRecognition } from "../../types/recognition";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import LinkButton from "../ui/LinkButton";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import GiveRecognitionDialog from "./GiveRecognitionDialog";
import RecognitionEntry from "./RecognitionEntry";

/**
 * Recognition someone received, on their profile. The server decides what this
 * viewer may see: company recognition for colleagues, plus private recognition
 * for the two people involved and HR. Counts come from the same filter, so a
 * private thank-you cannot be inferred from them.
 */
export default function ProfileRecognitionCard({ personId, fullName, isSelf }: {
  personId: number;
  fullName: string;
  isSelf: boolean;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileRecognition | null>(null);
  const [failed, setFailed] = useState(false);
  const [isGiving, setIsGiving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    getPersonRecognition(personId).then(setData).catch(() => setFailed(true));
  }, [personId]);

  useEffect(load, [load]);

  const canGive = !isSelf && user?.employeeId !== null && user?.employeeId !== undefined;
  const firstName = fullName.split(" ")[0];

  return (
    <SectionCard
      title="Recognition"
      icon={Award}
      actions={canGive ? (
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setIsGiving(true)}>Recognise {firstName}</Button>
      ) : isSelf ? (
        <LinkButton to="/recognition?view=received" variant="ghost" size="sm">All received</LinkButton>
      ) : undefined}
    >
      {notice && <Alert tone="success" className="mb-3" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {failed ? (
        <p className="text-sm text-fg-muted">Recognition could not be loaded.</p>
      ) : !data ? (
        <SkeletonText lines={3} />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-fg-muted">{isSelf ? "When a colleague thanks you, it appears here." : `No recognition for ${firstName} yet.`}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2" aria-label="Recognition by category">
            {data.byCategory.map((entry) => (
              <li key={entry.category} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                {entry.label} · {entry.count}
              </li>
            ))}
          </ul>
          <ul className="mt-2 divide-y divide-line">
            {data.items.slice(0, 5).map((item) => <li key={item.id}><RecognitionEntry item={item} compact /></li>)}
          </ul>
        </>
      )}

      {canGive && (
        <GiveRecognitionDialog
          isOpen={isGiving}
          receiver={{ id: personId, name: fullName }}
          onClose={() => setIsGiving(false)}
          onGiven={(message) => {
            setIsGiving(false);
            setNotice(message);
            load();
          }}
        />
      )}
    </SectionCard>
  );
}
