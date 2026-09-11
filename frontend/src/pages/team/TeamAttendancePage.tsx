import { BadgeCheck, CalendarRange, Clock3, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getTeamAttendance, getTeamAttendanceSummary } from "../../api/teamApi";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import type { TeamAttendanceSummaryRow, TeamMember } from "../../types/team";
import { calcWorkMinutes, formatWorkHours } from "../../utils/attendance";
import { formatDate, formatTime } from "../../utils/datetime";
import { dayStatusMeta } from "./teamStatus";

const dayHeaders = ["Team member", "Status", "Check-in", "Check-out", "Worked", "Verification"];
const summaryHeaders = ["Team member", "Days recorded", "Present", "Late", "Absent", "Late minutes", "Missing check-out"];

function verificationLabel(member: TeamMember): string {
  if (!member.day.verificationStatus) return "—";
  if (member.day.verificationStatus === "verified") return "QR and location";
  if (member.day.verificationStatus === "manual") return "Entered by HR";
  return "Exception";
}

/**
 * The team's attendance: one day at a time, and the last 30 days in total.
 *
 * Status, times and the coarse verification state only. The server never
 * sends a team member's coordinates, GPS accuracy or distance from the office
 * to a manager, so none of it can appear here.
 */
export default function TeamAttendancePage() {
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [summary, setSummary] = useState<{ from: string; to: string; rows: TeamAttendanceSummaryRow[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDay = useCallback(async (value?: string) => {
    setIsLoading(true);
    setError("");
    try {
      const result = await getTeamAttendance(value);
      setMembers(result.members);
      setDate(result.date);
      setToday(result.today);
    } catch (requestError) {
      setMembers([]);
      setError(getApiErrorMessage(requestError, "Your team's attendance could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDay();
    getTeamAttendanceSummary().then(setSummary).catch(() => setSummary(null));
  }, [loadDay]);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Team attendance"
        description="Who clocked in and when, for the people who report to you."
        backTo="/team"
        backLabel="Back to my team"
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      <SectionCard
        title={date ? formatDate(date) : "Day"}
        description={date && date === today ? "Today, in the company's time zone" : undefined}
        icon={Clock3}
        padded={false}
        actions={
          <FormField id="team-attendance-date" label="Day" className="w-44">
            <TextInput
              id="team-attendance-date"
              type="date"
              value={date}
              max={today || undefined}
              onChange={(event) => {
                if (event.target.value) void loadDay(event.target.value);
              }}
            />
          </FormField>
        }
      >
        <DataTable
          plain
          headers={dayHeaders}
          caption="Team attendance for the selected day"
          minWidthClass="min-w-180"
          isLoading={isLoading}
          loadingLabel="Loading team attendance"
          isEmpty={members.length === 0}
          emptyState={<EmptyState icon={UsersRound} title="No one reports to you" description="Your team appears here when HR records reporting lines." />}
          mobileCards={members.map((member) => (
            <RecordCard
              key={member.id}
              leading={<Avatar name={member.fullName} src={resolveProfileImageUrl(member.profileImage)} size="md" />}
              title={member.fullName}
              subtitle={member.jobTitle ?? undefined}
              badge={<StatusBadge {...dayStatusMeta(member.day)} />}
              meta={[
                { label: "In", value: formatTime(member.day.checkInTime) },
                { label: "Out", value: formatTime(member.day.checkOutTime) },
                { label: "Worked", value: formatWorkHours(calcWorkMinutes(member.day.checkInTime, member.day.checkOutTime)) },
                { label: "Verification", value: verificationLabel(member) },
              ]}
            />
          ))}
        >
          {members.map((member) => (
            <tr key={member.id} className="transition-colors hover:bg-surface-muted">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={member.fullName} src={resolveProfileImageUrl(member.profileImage)} size="sm" />
                  <div className="min-w-0">
                    <p className="font-medium text-fg [overflow-wrap:anywhere]">{member.fullName}</p>
                    <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">{member.jobTitle ?? "—"}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3">
                <StatusBadge {...dayStatusMeta(member.day)} />
                {member.day.lateMinutes ? <p className="mt-1 text-xs text-warning-fg">{member.day.lateMinutes} min late</p> : null}
              </td>
              <td className="px-5 py-3 tabular-nums text-fg">{formatTime(member.day.checkInTime)}</td>
              <td className="px-5 py-3 tabular-nums text-fg">{formatTime(member.day.checkOutTime)}</td>
              <td className="px-5 py-3 tabular-nums text-fg-muted">
                {formatWorkHours(calcWorkMinutes(member.day.checkInTime, member.day.checkOutTime))}
              </td>
              <td className="px-5 py-3 text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  {member.day.verificationStatus === "verified" && <BadgeCheck size={14} className="text-success-fg" aria-hidden="true" />}
                  {verificationLabel(member)}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>

      <SectionCard
        title="Last 30 days"
        description={summary ? `${formatDate(summary.from)} to ${formatDate(summary.to)}` : undefined}
        icon={CalendarRange}
        padded={false}
      >
        <DataTable
          plain
          headers={summaryHeaders}
          caption="Team attendance totals over the last 30 days"
          minWidthClass="min-w-180"
          isLoading={summary === null && !error}
          isEmpty={(summary?.rows.length ?? 0) === 0}
          emptyState={<p className="px-5 py-8 text-center text-sm text-fg-muted">No totals to show.</p>}
          mobileCards={(summary?.rows ?? []).map((row) => (
            <RecordCard
              key={row.employeeId}
              title={row.fullName}
              subtitle={row.employeeNumber}
              meta={[
                { label: "Recorded", value: row.daysRecorded },
                { label: "Late", value: `${row.late} (${row.lateMinutes} min)` },
                { label: "Absent", value: row.absent },
                { label: "No check-out", value: row.missingCheckout },
              ]}
            />
          ))}
        >
          {(summary?.rows ?? []).map((row) => (
            <tr key={row.employeeId}>
              <td className="px-5 py-3 font-medium text-fg [overflow-wrap:anywhere]">{row.fullName}</td>
              <td className="px-5 py-3 tabular-nums">{row.daysRecorded}</td>
              <td className="px-5 py-3 tabular-nums">{row.present}</td>
              <td className="px-5 py-3 tabular-nums">{row.late}</td>
              <td className="px-5 py-3 tabular-nums">{row.absent}</td>
              <td className="px-5 py-3 tabular-nums">{row.lateMinutes}</td>
              <td className="px-5 py-3 tabular-nums">{row.missingCheckout}</td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>
    </section>
  );
}
