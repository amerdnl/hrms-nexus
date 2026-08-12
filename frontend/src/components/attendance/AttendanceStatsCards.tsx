import {
  CalendarCheck,
  CalendarOff,
  Clock3,
  UserCheck,
  UserMinus,
} from "lucide-react";
import StatCard from "../ui/StatCard";
import type { AttendanceStatistics } from "../../types/attendance";
import type { StatusTone } from "../../utils/status";

type AttendanceStatsCardsProps = {
  statistics: AttendanceStatistics;
  loading: boolean;
  /**
   * Formatted statistics date. The endpoint counts a single day
   * (`WHERE attendance_date = $1`), so the date is named on the card rather
   * than leaving "Total records" to read like an all-time figure.
   */
  dateLabel?: string;
};

/**
 * Share of the day's records, derived from the existing statistics payload -
 * no new backend metric. Guards total <= 0 so an empty day renders a sentence
 * rather than NaN%.
 */
function share(value: number, total: number): string {
  if (total <= 0) return "No records for this date";

  return `${Math.round((value / total) * 100)}% of ${total} that day`;
}

function AttendanceStatsCards({
  statistics,
  loading,
  dateLabel,
}: AttendanceStatsCardsProps) {
  const { total } = statistics;
  const onDate = dateLabel ? `on ${dateLabel}` : "for the selected date";

  const cards: Array<{
    label: string;
    value: number;
    icon: typeof CalendarCheck;
    tone: StatusTone;
    hint: string;
  }> = [
    {
      label: "Total records",
      value: total,
      icon: CalendarCheck,
      tone: "neutral",
      hint: total > 0 ? `Recorded ${onDate}` : "No records for this date",
    },
    {
      label: "Present",
      value: statistics.present,
      icon: UserCheck,
      tone: "success",
      hint: share(statistics.present, total),
    },
    {
      label: "Late",
      value: statistics.late,
      icon: Clock3,
      tone: "warning",
      hint: share(statistics.late, total),
    },
    {
      label: "Absent",
      value: statistics.absent,
      icon: UserMinus,
      tone: "danger",
      hint: share(statistics.absent, total),
    },
    {
      label: "On leave",
      value: statistics.onLeave,
      icon: CalendarOff,
      tone: "info",
      hint: share(statistics.onLeave, total),
    },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          tone={card.tone}
          hint={card.hint}
          isLoading={loading}
        />
      ))}
    </div>
  );
}

export default AttendanceStatsCards;
