import { Inbox } from "lucide-react";
import ActionsCard from "../../home/ActionsCard";
import KpiCard from "../../home/KpiCard";
import TasksCard from "../../home/TasksCard";
import TodayCard from "../../home/TodayCard";
import UpdatesCard from "../../home/UpdatesCard";
import WhosOutCard from "../../home/WhosOutCard";
import { formatShortDay } from "../../home/homeTime";
import { sources, useSharedCalendar, useSource } from "../dashboardData";
import type { WidgetProps } from "../widgetRegistry";

/** Widgets any signed-in account may place. Each reads an endpoint open to every account. */

export function ActionCenterWidget({ size }: WidgetProps) {
  const { data, failed } = useSource(sources.actionCenter);
  if (size === "small") {
    const count = data?.requiresAction.length ?? 0;
    const important = data?.requiresAction.filter((item) => item.important).length ?? 0;
    const earliest = data?.requiresAction.filter((item) => item.date).sort((a, b) => a.date!.localeCompare(b.date!))[0];
    return (
      <KpiCard
        icon={Inbox}
        tint="amber"
        label="Needs you"
        isLoading={!data && !failed}
        value={failed ? "—" : count}
        detail={failed ? "Could not be loaded" : !data ? undefined : count === 0 ? "All caught up" : important > 0 ? `${important} important` : earliest ? `Earliest ${formatShortDay(earliest.date!)}` : "In your Action Center"}
        to="/actions"
        className="h-full"
      />
    );
  }
  return <ActionsCard data={data} failed={failed} limit={size === "large" ? 6 : 3} className="h-full" />;
}

export function MyTasksWidget() {
  return <TasksCard className="h-full" />;
}

export function TodayWidget() {
  const { state, calendar } = useSharedCalendar();
  return <TodayCard state={state} calendar={calendar} className="h-full" />;
}

export function WhosOutWidget({ size }: WidgetProps) {
  const { state, calendar } = useSharedCalendar();
  return <WhosOutCard state={state} calendar={calendar} limit={size === "large" ? 6 : 3} className="h-full" />;
}

export function CompanyUpdatesWidget() {
  return <UpdatesCard className="h-full" />;
}
