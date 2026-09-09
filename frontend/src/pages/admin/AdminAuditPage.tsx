import { ScrollText, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getAuditLog, type AuditFilters } from "../../api/auditApi";
import Alert from "../../components/ui/Alert";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import { describeChange, readableAction, type AuditPage } from "../../types/audit";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 25;

export default function AdminAuditPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Draft filters live in the inputs; these are what the current page was
  // actually fetched with, so "Apply filters" means something and paging cannot
  // silently change the query underneath itself.
  const [applied, setApplied] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getAuditLog({ ...applied, page, pageSize: PAGE_SIZE }));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load the audit log."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied({
      action: action || undefined,
      entityType: entityType || undefined,
      outcome: outcome || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  };

  const clearFilters = () => {
    setAction(""); setEntityType(""); setOutcome(""); setFrom(""); setTo("");
    setPage(1);
    setApplied({});
  };

  const activeCount = [action, entityType, outcome, from, to].filter(Boolean).length;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Entries are appended and can never be edited or removed."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <FilterPanel
        columns={3}
        onApply={applyFilters}
        onClear={clearFilters}
        isBusy={loading}
        activeCount={activeCount}
      >
        <FormField id="audit-action" label="Action">
          <SelectInput
            id="audit-action" value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="">All actions</option>
            {(data?.actions ?? []).map((option) => (
              <option key={option} value={option}>{readableAction(option)}</option>
            ))}
          </SelectInput>
        </FormField>

        <FormField id="audit-entity" label="Area">
          <SelectInput
            id="audit-entity" value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          >
            <option value="">All areas</option>
            {(data?.entityTypes ?? []).map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1).replaceAll("_", " ")}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField id="audit-outcome" label="Outcome">
          <SelectInput
            id="audit-outcome" value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </SelectInput>
        </FormField>

        <FormField id="audit-from" label="From">
          <TextInput
            id="audit-from" type="date" value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </FormField>

        <FormField id="audit-to" label="To">
          <TextInput
            id="audit-to" type="date" value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </FormField>
      </FilterPanel>

      <SectionCard
        title={data ? `${data.total} recorded event${data.total === 1 ? "" : "s"}` : "Recorded events"}
        padded={false}
      >
        <DataTable
          headers={["When", "Actor", "Action", "Target", "What changed", "Outcome"]}
          isLoading={loading}
          isEmpty={!loading && (data?.events.length ?? 0) === 0}
          caption="Audit events, newest first"
          minWidthClass="min-w-250"
          emptyState={
            <EmptyState
              icon={error ? ShieldAlert : ScrollText}
              title={error ? "The audit log could not be read" : "No matching events"}
              description={
                error
                  ? "Adjust the filters above and apply again."
                  : "Nothing has been recorded for these filters yet."
              }
            />
          }
        >
          {data?.events.map((event) => (
            <tr key={event.id} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-fg-muted">
                {formatDateTime(event.occurred_at)}
              </td>
              <td className="px-4 py-3 text-sm">
                <span className="block font-medium text-fg">{event.actor_label}</span>
                {event.actor_role && (
                  <span className="text-xs text-fg-subtle">{event.actor_role}</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-fg">
                {readableAction(event.action)}
              </td>
              <td className="px-4 py-3 text-sm text-fg-muted">
                {event.entity_type}
                {event.entity_id ? ` #${event.entity_id}` : ""}
              </td>
              <td className="px-4 py-3 text-sm text-fg-muted">
                <span className="block text-fg">{event.summary}</span>
                {event.changes && (
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(event.changes).map(([field, value]) => (
                      <li key={field} className="text-xs">
                        <span className="font-medium text-fg-subtle">
                          {field.replaceAll("_", " ")}:
                        </span>{" "}
                        <span className="font-mono">{describeChange(value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                <StatusBadge
                  label={event.outcome === "success" ? "Success" : "Failure"}
                  tone={event.outcome === "success" ? "success" : "danger"}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>

      {data && data.totalPages > 1 && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          totalItems={data.total}
          onPageChange={setPage}
        />
      )}

      <p className="text-xs text-fg-subtle">
        The audit log never records passwords, password hashes, tokens, QR material or any
        other secret, and it does not record attendance coordinates. Entries are appended
        only: the database refuses any attempt to change or delete one.
      </p>
    </section>
  );
}
