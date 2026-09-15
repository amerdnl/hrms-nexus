import { BadgeCheck, Clock3, LogIn, LogOut, Pencil } from "lucide-react";
import type { AttendanceStatus } from "../../types/attendance";
import { calcWorkMinutes, formatWorkHours } from "../../utils/attendance";
import { cn } from "../../utils/cn";
import { formatTime } from "../../utils/datetime";
import { attendanceStatusMeta, type StatusMeta, type StatusTone } from "../../utils/status";
import Button from "../ui/Button";
import SectionCard from "../ui/SectionCard";
import StatusBadge from "../ui/StatusBadge";

export type ClockMode = "check-in" | "check-out";

interface TodayAttendanceCardProps {
  /**
   * The company's date, from the server. Optional on purpose: a caller that
   * has no server date must pass nothing rather than derive one, because the
   * company's "today" is set by its Company Settings timezone, not the
   * browser's or Malaysia's.
   */
  dateLabel?: string;
  /** Null when nothing has been recorded today. */
  status: AttendanceStatus | null;
  checkInTime: string | null | undefined;
  checkOutTime: string | null | undefined;
  /**
   * The coarse verification state and nothing finer. This card is never given
   * coordinates, accuracy or distance, so it cannot display them.
   */
  verificationStatus?: "verified" | "manual" | "exception" | null;
  /** Today's record began as a verified scan and HR has since corrected it. */
  correctedByHr?: boolean;
  lateMinutes?: number | null;
  /** True while loading or while the verified panel is already open. */
  actionsDisabled?: boolean;
  /** Opens the verified flow. The card never records anything itself. */
  onStart: (mode: ClockMode) => void;
  className?: string;
}

const notRecordedMeta: StatusMeta = { label: "Not recorded", tone: "neutral", icon: Clock3 };

const heroTone: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
  primary: "bg-primary-soft text-primary",
  neutral: "bg-surface-muted text-fg-muted",
};

function verificationLabel(status: "verified" | "manual" | "exception", correctedByHr: boolean): string {
  // First: a corrected scan is neither verified nor entered by HR.
  if (correctedByHr) return "Today's record was corrected by HR";
  if (status === "verified") return "Today's record is verified";
  if (status === "manual") return "Today's record was entered by an administrator";
  return "Today's record is marked as an exception";
}

/**
 * Explains an em dash rather than leaving it ambiguous: "no check-out yet" and
 * "the recorded times do not make sense" both render as "—", and only this
 * line tells them apart.
 */
function workedHint(checkedIn: boolean, checkedOut: boolean, minutes: number | null): string {
  if (!checkedIn) return "Check in to start the day";
  if (!checkedOut) return "Check out to see the total";
  if (minutes === null) return "Recorded times cannot be totalled";
  return "No break deducted";
}

/**
 * Today's attendance, and the one thing to do about it.
 *
 * Shared by the employee dashboard and the attendance page so the two can
 * never disagree about today, and so the action rule lives once: Check in
 * until checked in, then Check out until checked out, then neither. Either
 * button only asks the caller to open VerifiedClockPanel - QR, location and
 * the request itself all stay there, untouched.
 */
export default function TodayAttendanceCard({
  dateLabel,
  status,
  checkInTime,
  checkOutTime,
  verificationStatus,
  correctedByHr = false,
  lateMinutes,
  actionsDisabled = false,
  onStart,
  className,
}: TodayAttendanceCardProps) {
  const meta = status ? attendanceStatusMeta(status) : notRecordedMeta;
  const checkedIn = Boolean(checkInTime);
  const checkedOut = Boolean(checkOutTime);
  const minutes = calcWorkMinutes(checkInTime, checkOutTime);
  const next: ClockMode | null = !checkedIn ? "check-in" : !checkedOut ? "check-out" : null;
  const VerificationIcon = correctedByHr ? Pencil : BadgeCheck;

  return (
    <SectionCard className={className} title="Today" description={dateLabel} icon={Clock3}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", heroTone[meta.tone])}
            aria-hidden="true"
          >
            <meta.icon size={26} />
          </span>
          <div>
            <p className="text-2xl font-bold tracking-tight text-fg">{meta.label}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
              {verificationStatus ? (
                <>
                  <VerificationIcon className="size-3.5" aria-hidden="true" />
                  {verificationLabel(verificationStatus, correctedByHr)}
                </>
              ) : (
                "Nothing recorded yet today"
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          {next ? (
            <Button
              icon={next === "check-in" ? LogIn : LogOut}
              onClick={() => onStart(next)}
              disabled={actionsDisabled}
              className="sm:min-w-40"
            >
              {next === "check-in" ? "Check in" : "Check out"}
            </Button>
          ) : (
            <StatusBadge label="Done for today" tone="success" icon={BadgeCheck} />
          )}
          {/* How the next action is verified. Once HR has corrected a finished
              day there is no next action, and the line would read as a claim
              about the corrected record, so it is left out. */}
          {(next || !correctedByHr) && (
            <p className="text-xs text-fg-subtle">Verified with the office QR code</p>
          )}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-5">
        {[
          ["Check-in", formatTime(checkInTime)],
          ["Check-out", formatTime(checkOutTime)],
          ["Worked", formatWorkHours(minutes)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-fg-subtle">{label}</dt>
            <dd className="mt-0.5 break-words text-lg font-semibold tabular-nums text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-fg-subtle">
        {workedHint(checkedIn, checkedOut, minutes)}
        {lateMinutes !== null && lateMinutes !== undefined && lateMinutes > 0 && (
          <span className="text-warning-fg"> · checked in {lateMinutes} minutes late</span>
        )}
      </p>
    </SectionCard>
  );
}
