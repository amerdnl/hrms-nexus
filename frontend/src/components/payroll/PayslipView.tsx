import { Building2 } from "lucide-react";
import { formatPeriod, formatSen, type PayrollRecordDetail } from "../../types/payroll";

/**
 * One payslip, shared by the administrator's record view and the employee's own
 * payslip. Every total is the sum of the lines shown above it, so a figure can
 * always be explained rather than taken on trust.
 */
export default function PayslipView({ detail }: { detail: PayrollRecordDetail }) {
  const { record, items, period } = detail;
  const earnings = items.filter((item) => item.item_type === "earning");
  const deductions = items.filter((item) => item.item_type === "deduction");

  const Row = ({ label, amount, muted }: { label: string; amount: string; muted?: boolean }) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={muted ? "text-sm text-fg-muted" : "text-sm text-fg"}>{label}</span>
      <span className="font-mono text-sm tabular-nums text-fg">{amount}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-base font-semibold text-fg">{record.full_name}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {record.employee_number}
            {record.job_title ? ` · ${record.job_title}` : ""}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
            <Building2 size={13} aria-hidden="true" />
            {record.department_name ?? "Unassigned"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-fg">
            {formatPeriod(period.period_year, period.period_month)}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">{record.working_days} working days</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Earnings
          </h3>
          <div className="divide-y divide-line">
            {earnings.map((item) => (
              <Row
                key={item.id}
                label={item.label + (item.is_manual ? " (manual)" : "")}
                amount={formatSen(item.amount_sen)}
              />
            ))}
            {earnings.length === 0 && <Row label="None" amount="0.00" muted />}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line-strong pt-2">
            <span className="text-sm font-semibold text-fg">Gross pay</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-fg">
              {formatSen(record.gross_sen)}
            </span>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Deductions
          </h3>
          <div className="divide-y divide-line">
            {deductions.map((item) => (
              <Row
                key={item.id}
                label={
                  item.label
                  + (item.is_statutory
                    ? " (statutory, entered manually)"
                    : item.is_manual ? " (manual)" : "")
                }
                amount={formatSen(item.amount_sen)}
              />
            ))}
            {deductions.length === 0 && <Row label="None" amount="0.00" muted />}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line-strong pt-2">
            <span className="text-sm font-semibold text-fg">Total deductions</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-fg">
              {formatSen(record.deductions_sen)}
            </span>
          </div>
        </section>
      </div>

      <div className="flex items-baseline justify-between gap-4 rounded-card bg-surface-muted px-4 py-3">
        <span className="text-sm font-semibold text-fg">Net pay</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-fg">
          {formatSen(record.net_sen)}
        </span>
      </div>

      <p className="text-xs text-fg-subtle">
        Amounts are in MYR. HR Nexus does not calculate EPF, SOCSO, EIS or PCB: any
        statutory line above was entered by hand and is not a compliance
        calculation. Periods are not pro-rated, so a mid-month joiner or salary
        change is shown at the full monthly amount.
      </p>
    </div>
  );
}
