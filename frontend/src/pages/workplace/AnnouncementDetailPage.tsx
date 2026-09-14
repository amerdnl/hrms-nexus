import { Archive, Megaphone, Pencil, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getApiErrorMessage } from "../../api/axios";
import {
  archiveAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  markAnnouncementRead,
  publishAnnouncement,
} from "../../api/workplaceApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/useAuth";
import type { Announcement } from "../../types/workplace";
import { formatDate } from "../../utils/datetime";
import { fullTimestamp } from "../../utils/relativeTime";

type Pending = "publish" | "archive" | "delete" | null;

/**
 * One announcement, as plain text. Opening it marks it read (and clears the
 * notification that pointed here). HR also manages it from this page.
 */
export default function AnnouncementDetailPage() {
  const { id } = useParams();
  const announcementId = Number(id);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [isWorking, setIsWorking] = useState(false);

  const load = useCallback(() => {
    if (!Number.isSafeInteger(announcementId) || announcementId <= 0) {
      setState("missing");
      return;
    }
    setState("loading");
    getAnnouncement(announcementId)
      .then((found) => {
        setAnnouncement(found);
        setState("ready");
        if (found.status === "published" && !found.isRead) {
          markAnnouncementRead(found.id).catch(() => undefined);
        }
      })
      .catch((requestError) => {
        if (axios.isAxiosError(requestError) && requestError.response?.status === 404) setState("missing");
        else {
          setError(getApiErrorMessage(requestError, "This announcement could not be loaded."));
          setState("failed");
        }
      });
  }, [announcementId]);

  useEffect(load, [load]);

  async function run() {
    if (!announcement || !pending) return;
    setIsWorking(true);
    setError("");
    try {
      if (pending === "delete") {
        await deleteAnnouncement(announcement.id);
        navigate("/announcements?tab=draft", { replace: true });
        return;
      }
      const updated = pending === "publish"
        ? await publishAnnouncement(announcement.id, announcement.revision)
        : await archiveAnnouncement(announcement.id);
      setAnnouncement(updated);
      setNotice(pending === "publish" ? "Published. Its audience has been notified." : "Archived. It no longer appears on anyone's feed.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "That did not work. Reload to see the latest version."));
    } finally {
      setIsWorking(false);
      setPending(null);
    }
  }

  if (state === "missing") {
    return (
      <section className="max-w-3xl space-y-6">
        <PageHeader title="Announcement" backTo="/announcements" backLabel="Announcements" />
        <SectionCard>
          <EmptyState
            icon={Megaphone}
            title="This announcement is not available"
            description="It may have been archived, or it was addressed to a different department."
            action={<LinkButton to="/announcements" variant="secondary">All announcements</LinkButton>}
          />
        </SectionCard>
      </section>
    );
  }

  if (state === "failed") {
    return (
      <section className="max-w-3xl space-y-6">
        <PageHeader title="Announcement" backTo="/announcements" backLabel="Announcements" />
        <SectionCard><ErrorState title="This announcement could not be loaded" description={error} onRetry={load} /></SectionCard>
      </section>
    );
  }

  if (state === "loading" || !announcement) {
    return (
      <section className="max-w-3xl space-y-6">
        <SectionCard><p className="sr-only" role="status">Loading the announcement</p><SkeletonText lines={8} /></SectionCard>
      </section>
    );
  }

  const stamp = announcement.publishedAt ?? announcement.updatedAt;

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader
        title={announcement.title}
        backTo="/announcements"
        backLabel="Announcements"
        actions={isAdmin && (
          <div className="flex flex-wrap gap-2">
            {announcement.status !== "archived" && (
              <LinkButton to={`/admin/announcements/${announcement.id}/edit`} variant="secondary" size="sm" icon={Pencil}>Edit</LinkButton>
            )}
            {announcement.status === "draft" && (
              <>
                <Button size="sm" icon={Send} onClick={() => setPending("publish")}>Publish</Button>
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPending("delete")}>Delete</Button>
              </>
            )}
            {announcement.status === "published" && (
              <Button variant="ghost" size="sm" icon={Archive} onClick={() => setPending("archive")}>Archive</Button>
            )}
          </div>
        )}
      />

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      <SectionCard>
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          {announcement.priority === "important" && <StatusBadge label="Important" tone="warning" />}
          {announcement.status !== "published" && (
            <StatusBadge label={announcement.status === "draft" ? "Draft" : "Archived"} tone={announcement.status === "draft" ? "info" : "neutral"} />
          )}
          <span>To {announcement.audience === "company" ? "everyone" : announcement.departmentName ?? "one department"}</span>
          {announcement.authorName && <span>· From {announcement.authorName}</span>}
          <span>
            · <time dateTime={stamp} title={fullTimestamp(stamp)}>{fullTimestamp(stamp)}</time>
            {announcement.edited ? " (edited)" : ""}
          </span>
          {announcement.expiresOn && <span>· Shown until {formatDate(announcement.expiresOn)}</span>}
        </div>
        {/* Plain text on purpose: nothing HR types is interpreted as markup. */}
        <div className="mt-5 whitespace-pre-line text-base leading-relaxed text-fg [overflow-wrap:anywhere]">{announcement.body}</div>
      </SectionCard>

      <ConfirmationModal
        isOpen={pending !== null}
        isProcessing={isWorking}
        tone={pending === "delete" ? "danger" : "primary"}
        title={pending === "publish" ? "Publish this announcement?" : pending === "archive" ? "Archive this announcement?" : "Delete this draft?"}
        description={pending === "publish"
          ? `Everyone in ${announcement.audience === "company" ? "the company" : announcement.departmentName ?? "the department"} will be notified. Its audience cannot be changed afterwards.`
          : pending === "archive"
            ? "It leaves every feed. The record and who read it are kept."
            : "The draft is removed. Nobody has seen it."}
        confirmLabel={pending === "publish" ? "Publish" : pending === "archive" ? "Archive" : "Delete draft"}
        processingLabel="Working…"
        onCancel={() => setPending(null)}
        onConfirm={() => void run()}
      />
    </section>
  );
}
