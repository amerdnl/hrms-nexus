import { useEffect, useMemo, useState } from "react";
import { getEmployeeLookup } from "../../api/employeeApi";
import type { EmployeeLookupEntry } from "../../types/employee";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import SelectInput from "../ui/SelectInput";

interface ManagerSelectProps {
  /** The employee being edited, or null when creating one. */
  employeeId: number | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

const ELIGIBLE = new Set(["active", "probation"]);

/**
 * "Reports to", for the employee forms.
 *
 * Offers only people who could accept the line: working employees, never the
 * employee themselves, and never anyone already below them - choosing one of
 * those would make a loop. That filtering is a courtesy computed from the
 * directory; the server checks the same rules and the database refuses a loop
 * outright, so a stale list can never create one.
 */
export default function ManagerSelect({ employeeId, value, onChange, disabled, error }: ManagerSelectProps) {
  const [directory, setDirectory] = useState<EmployeeLookupEntry[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getEmployeeLookup().then(setDirectory).catch(() => setFailed(true));
  }, []);

  const options = useMemo(() => {
    // Everyone below this employee, at any depth.
    const below = new Set<number>();
    if (employeeId !== null) {
      const children = new Map<number, number[]>();
      for (const entry of directory) {
        if (entry.managerId === null) continue;
        children.set(entry.managerId, [...(children.get(entry.managerId) ?? []), entry.id]);
      }
      const stack = [...(children.get(employeeId) ?? [])];
      while (stack.length > 0) {
        const next = stack.pop()!;
        if (below.has(next)) continue;
        below.add(next);
        stack.push(...(children.get(next) ?? []));
      }
    }

    return directory
      .filter((entry) => ELIGIBLE.has(entry.employmentStatus))
      .filter((entry) => entry.id !== employeeId && !below.has(entry.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [directory, employeeId]);

  // A current manager who has since left is still shown, so the form does not
  // silently change the line just by being opened and saved.
  const current = directory.find((entry) => String(entry.id) === value);
  const currentMissing = value !== "" && current && !options.some((option) => option.id === current.id);

  const hint = failed
    ? "The employee directory could not be loaded, so the manager cannot be changed right now."
    : "Their manager sees their attendance and decides their leave.";

  return (
    <FormField id="manager-id" label="Reports to" hint={error ? undefined : hint} error={error}>
      <SelectInput
        id="manager-id"
        aria-describedby={fieldDescribedBy("manager-id", { hint: !error, error: Boolean(error) })}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || failed}
        invalid={Boolean(error)}
      >
        <option value="">No manager</option>
        {currentMissing && current && (
          <option value={current.id}>{current.fullName} (no longer active)</option>
        )}
        {options.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.fullName}{entry.jobTitle ? ` — ${entry.jobTitle}` : ""}
          </option>
        ))}
      </SelectInput>
    </FormField>
  );
}
