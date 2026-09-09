import { CalendarCheck } from "lucide-react";
import type { LeaveBalance } from "../../types/leave";
import { leaveTypeMeta } from "../../utils/status";

interface LeaveBalanceCardsProps {
  balances: LeaveBalance[];
  leaveYear: number;
  isLoading?: boolean;
  failed?: boolean;
}

const format = (days: number) => (Number.isInteger(days) ? String(days) : days.toFixed(1));

/**
 * Entitled, used, pending and remaining per leave type.
 *
 * Pending is shown beside remaining rather than subtracted from it: the brief
 * requires that a pending request is never counted twice, but an employee still
 * needs to see that those days are spoken for.
 */
export default function LeaveBalanceCards({
  balances, leaveYear, isLoading, failed,
}: LeaveBalanceCardsProps) {
  if (failed) {
    return (
      <p className="text-sm text-fg-muted">
        Leave balances could not be loaded. You can still apply; the server checks
        your balance when you submit.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading balances...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.map((balance) => {
          const meta = leaveTypeMeta(balance.leaveType);
          return (
            <div
              key={balance.leaveType}
              className="rounded-card border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-fg">{meta.label}</p>
                <meta.icon size={16} className="text-fg-subtle" aria-hidden="true" />
              </div>

              {balance.deductsBalance ? (
                <>
                  <p className="mt-2 text-2xl font-semibold text-fg">
                    {format(balance.remainingDays)}
                    <span className="ml-1 text-sm font-normal text-fg-muted">
                      of {format(balance.entitledDays)} left
                    </span>
                  </p>
                  <dl className="mt-2 space-y-0.5 text-xs text-fg-muted">
                    <div className="flex justify-between gap-2">
                      <dt>Used</dt><dd className="text-fg">{format(balance.usedDays)}</dd>
                    </div>
                    {balance.pendingDays > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt>Awaiting approval</dt>
                        <dd className="text-warning-fg">{format(balance.pendingDays)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt>Can request now</dt>
                      <dd className="font-medium text-fg">{format(balance.availableDays)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-semibold text-fg">
                    {format(balance.usedDays)}
                    <span className="ml-1 text-sm font-normal text-fg-muted">taken</span>
                  </p>
                  <p className="mt-2 text-xs text-fg-muted">
                    No balance limit. {balance.isPaid ? "Paid." : "Unpaid, so it reduces pay."}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-2 text-xs text-fg-subtle">
        <CalendarCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Balances for {leaveYear}, counted in working days from your company's
          working week. Public holidays are not deducted separately yet, so a
          holiday inside a leave range still counts as leave. Entitlements are your
          company's policy, not a statutory minimum.
        </span>
      </p>
    </div>
  );
}
