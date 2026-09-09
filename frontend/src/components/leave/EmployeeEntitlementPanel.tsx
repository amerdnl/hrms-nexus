import { Scale } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeLeaveBalances, setEmployeeEntitlement } from "../../api/leaveApi";
import type { EmployeeLookupEntry } from "../../types/employee";
import { leaveTypes } from "../../types/leaveTypes";
import type { LeaveBalance, LeaveEntitlement, LeaveType } from "../../types/leave";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import PrimaryButton from "../ui/PrimaryButton";
import SectionCard from "../ui/SectionCard";
import SelectInput from "../ui/SelectInput";
import TextInput from "../ui/TextInput";
import { leaveTypeMeta } from "../../utils/status";

const format = (days: number | string) => {
  const value = Number(days);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

interface EmployeeEntitlementPanelProps {
  employees: EmployeeLookupEntry[];
  directoryFailed: boolean;
}

/**
 * Administrator view of one employee's balances, and the only place a grant is
 * changed. Usage is never editable here: days already taken are a property of
 * the requests themselves, so a correction adjusts the grant instead.
 */
export default function EmployeeEntitlementPanel({
  employees, directoryFailed,
}: EmployeeEntitlementPanelProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [entitlements, setEntitlements] = useState<LeaveEntitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [editType, setEditType] = useState<LeaveType>("annual");
  const [entitledDays, setEntitledDays] = useState("");
  const [carriedDays, setCarriedDays] = useState("");
  const [adjustmentDays, setAdjustmentDays] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!employeeId) {
      setBalances([]);
      setEntitlements([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const result = await getEmployeeLeaveBalances(Number(employeeId), Number(year));
      setBalances(result.balances);
      setEntitlements(result.entitlements);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load leave balances."));
      setBalances([]);
      setEntitlements([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  // Editing starts from what is actually stored, so a save never silently zeroes
  // a carry-forward the administrator could not see.
  useEffect(() => {
    const current = entitlements.find((entry) => entry.leave_type === editType);
    setEntitledDays(current ? String(Number(current.entitled_days)) : "");
    setCarriedDays(current ? String(Number(current.carried_forward_days)) : "");
    setAdjustmentDays(current ? String(Number(current.adjustment_days)) : "");
    setNote(current?.note ?? "");
  }, [entitlements, editType]);

  async function save() {
    setError("");
    setMessage("");

    const numeric = (value: string) => (value.trim() === "" ? 0 : Number(value));
    for (const [label, value] of [
      ["Entitled days", entitledDays], ["Carried forward", carriedDays], ["Adjustment", adjustmentDays],
    ] as const) {
      if (value.trim() !== "" && !Number.isFinite(Number(value))) {
        setError(`${label} must be a number.`);
        return;
      }
    }

    try {
      setSaving(true);
      await setEmployeeEntitlement(Number(employeeId), {
        leaveYear: Number(year),
        leaveType: editType,
        entitledDays: numeric(entitledDays),
        carriedForwardDays: numeric(carriedDays),
        adjustmentDays: numeric(adjustmentDays),
        note: note.trim() || undefined,
      });
      setMessage("Entitlement saved. Days already taken are unaffected.");
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to save that entitlement."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Leave balances and entitlements"
      description="Entitlements are your company's policy, not a statutory minimum. Days already taken cannot be edited here."
      icon={Scale}
    >
      <div className="space-y-5">
        {directoryFailed && (
          <Alert tone="warning">
            The employee directory could not be loaded, so balances cannot be looked up.
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {message && <Alert tone="success" onDismiss={() => setMessage("")}>{message}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="balance-employee" label="Employee">
            <SelectInput
              id="balance-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              disabled={directoryFailed}
            >
              <option value="">Select an employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} ({employee.employeeNumber})
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField id="balance-year" label="Leave year">
            <TextInput
              id="balance-year"
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </FormField>
        </div>

        {loading && <p className="text-sm text-fg-muted">Loading balances...</p>}

        {!loading && employeeId && balances.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-card border border-line">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-surface-muted text-fg-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Entitled</th>
                    <th className="px-4 py-2 font-medium">Used</th>
                    <th className="px-4 py-2 font-medium">Pending</th>
                    <th className="px-4 py-2 font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={balance.leaveType} className="border-t border-line">
                      <td className="px-4 py-2 text-fg">{leaveTypeMeta(balance.leaveType).label}</td>
                      <td className="px-4 py-2 text-fg-muted">
                        {balance.deductsBalance ? format(balance.entitledDays) : "No limit"}
                      </td>
                      <td className="px-4 py-2 text-fg-muted">{format(balance.usedDays)}</td>
                      <td className="px-4 py-2 text-fg-muted">{format(balance.pendingDays)}</td>
                      <td className="px-4 py-2 font-medium text-fg">
                        {balance.deductsBalance ? format(balance.remainingDays) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <FormField id="entitlement-type" label="Leave type">
                <SelectInput
                  id="entitlement-type"
                  value={editType}
                  onChange={(event) => setEditType(event.target.value as LeaveType)}
                >
                  {leaveTypes.map((type) => (
                    <option key={type} value={type}>{leaveTypeMeta(type).label}</option>
                  ))}
                </SelectInput>
              </FormField>

              <FormField id="entitlement-days" label="Entitled days">
                <TextInput id="entitlement-days" type="number" step="0.5" value={entitledDays}
                  onChange={(event) => setEntitledDays(event.target.value)} />
              </FormField>

              <FormField id="entitlement-carried" label="Carried forward">
                <TextInput id="entitlement-carried" type="number" step="0.5" value={carriedDays}
                  onChange={(event) => setCarriedDays(event.target.value)} />
              </FormField>

              <FormField id="entitlement-adjustment" label="Adjustment" hint="May be negative.">
                <TextInput id="entitlement-adjustment" type="number" step="0.5" value={adjustmentDays}
                  onChange={(event) => setAdjustmentDays(event.target.value)} />
              </FormField>

              <FormField id="entitlement-note" label="Note">
                <TextInput id="entitlement-note" value={note}
                  onChange={(event) => setNote(event.target.value)} placeholder="Why this changed" />
              </FormField>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => void load()} disabled={saving}>
                Reload
              </Button>
              <PrimaryButton onClick={() => void save()} isLoading={saving} loadingLabel="Saving...">
                Save entitlement
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
