import type { AttendanceStatistics } from "../../types/attendance";
import {
  CalendarCheck,
  CalendarOff,
  Clock3,
  UserCheck,
  UserMinus,
} from "lucide-react";

type AttendanceStatsCardsProps = {
  statistics: AttendanceStatistics;
  loading: boolean;
};

function AttendanceStatsCards({
  statistics,
  loading,
}: AttendanceStatsCardsProps) {
  const cards = [
    {
      label: "Total records",
      value: statistics.total,
      icon: CalendarCheck,
      color: "text-slate-700",
      background: "bg-slate-100",
    },
    {
      label: "Present",
      value: statistics.present,
      icon: UserCheck,
      color: "text-green-700",
      background: "bg-green-100",
    },
    {
      label: "Late",
      value: statistics.late,
      icon: Clock3,
      color: "text-amber-700",
      background: "bg-amber-100",
    },
    {
      label: "Absent",
      value: statistics.absent,
      icon: UserMinus,
      color: "text-red-700",
      background: "bg-red-100",
    },
    {
      label: "On leave",
      value: statistics.onLeave,
      icon: CalendarOff,
      color: "text-blue-700",
      background: "bg-blue-100",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>

                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {loading ? "—" : card.value}
                </p>
              </div>

              <div
                className={`rounded-lg p-3 ${card.background} ${card.color}`}
              >
                <Icon size={21} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AttendanceStatsCards;
