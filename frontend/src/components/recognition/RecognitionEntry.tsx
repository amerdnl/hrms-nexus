import { ArrowRight, Award, EyeOff, Lock, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import type { RecognitionItem } from "../../types/recognition";
import { fullTimestamp, relativeTime } from "../../utils/relativeTime";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import StatusBadge from "../ui/StatusBadge";

const personLink = "font-semibold text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]";

/**
 * One recognition: who thanked whom, for what, in their own words. Plain text,
 * never markup. HR sees a hide or restore control; nobody else sees whether
 * moderation has happened.
 */
export default function RecognitionEntry({ item, onModerate, busy = false, compact = false }: {
  item: RecognitionItem;
  onModerate?: (item: RecognitionItem, hidden: boolean) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <article className="flex gap-3 py-4">
      <Avatar name={item.giver.fullName} src={resolveProfileImageUrl(item.giver.profileImage)} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-muted">
          <Link to={`/people/${item.giver.id}`} className={personLink}>{item.giver.fullName}</Link>
          <ArrowRight size={13} aria-hidden="true" />
          <span className="sr-only">recognised</span>
          <Link to={`/people/${item.receiver.id}`} className={personLink}>{item.receiver.fullName}</Link>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
            <Award size={12} aria-hidden="true" />{item.categoryLabel}
          </span>
          {item.visibility === "private" && (
            <span className="inline-flex items-center gap-1 text-xs text-fg-subtle"><Lock size={12} aria-hidden="true" />Private</span>
          )}
          {item.hidden && <StatusBadge label="Hidden" tone="neutral" />}
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-fg [overflow-wrap:anywhere]">{item.message}</p>
        <time dateTime={item.createdAt} title={fullTimestamp(item.createdAt)} className="mt-1.5 block text-xs text-fg-subtle">
          {relativeTime(item.createdAt)}
        </time>
      </div>
      {onModerate && (
        <div className="shrink-0">
          {item.hidden ? (
            <Button variant="ghost" size="sm" icon={RotateCcw} disabled={busy} onClick={() => onModerate(item, false)} aria-label={`Restore recognition from ${item.giver.fullName}`}>Restore</Button>
          ) : (
            <Button variant="ghost" size="sm" icon={EyeOff} disabled={busy} onClick={() => onModerate(item, true)} aria-label={`Hide recognition from ${item.giver.fullName}`}>Hide</Button>
          )}
        </div>
      )}
    </article>
  );
}
