import { ChevronRight, CircleCheck, ScrollText, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getAuditLog, type AuditFilters } from "../../api/auditApi";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import Skeleton from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import {
  describeChange,
  readableAction,
  type AuditEvent,
  type AuditPage,
} from "../../types/audit";
import { formatDate, formatDateTime } from "../../utils/datetime";

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

  /*
   * Events grouped by calendar day, newest first, in the VIEWER's local zone -
   * the same zone formatDateTime renders times in - so an event at 11:50 pm is
   * never filed under the next day's heading.
   */
  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(iso));
  const todayKey = dayKey(new Date().toISOString());
  const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const dayLabel = (key: string) =>
    key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : formatDate(key);
  const timeOnly = (iso: string) =>
    new Intl.DateTimeFormat("en-MY", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const groups: Array<{ key: string; events: AuditEvent[] }> = [];
  for (const event of data?.events ?? []) {
    const key = dayKey(event.occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, events: [event] });
  }

  const areaLabel = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Entries are appended and can never be edited or removed."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <FilterPanel
        title="Filter events"
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
              <option key={option} value={option}>{areaLabel(option)}</option>
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

      {/*
        A timeline rather than a table. This is a chronological record read top
        to bottom, and as a six-column table it clipped its outcome column at
        1280 and needed horizontal scrolling on every phone. The same list
        serves every width.
      */}
      <SectionCard
        title={data ? `${data.total} recorded event${data.total === 1 ? "" : "s"}` : "Recorded events"}
        icon={ScrollText}
        padded={false}
      >
        {loading ? (
          <div className="space-y-5 p-5" aria-busy="true">
            <p className="sr-only" aria-live="polite">Loading audit events</p>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-start gap-3" aria-hidden="true">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={error ? ShieldAlert : ScrollText}
            title={error ? "The audit log could not be read" : "No matching events"}
            description={
              error
                ? "Adjust the filters above and apply again."
                : "Nothing has been recorded for these filters yet."
            }
          />
        ) : (
          <div>
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`day-${group.key}`}>
                <h3
                  id={`day-${group.key}`}
                  className="sticky top-16 z-10 border-y border-line bg-surface-muted/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted backdrop-blur first:border-t-0"
                >
                  {dayLabel(group.key)}
                </h3>
                <ol className="divide-y divide-line">
                  {group.events.map((event) => {
                    const changeCount = event.changes ? Object.keys(event.changes).length : 0;
                    const failed = event.outcome === "failure";
                    return (
                      <li key={event.id} className="flex gap-3 px-5 py-4">
                        <Avatar name={event.actor_label} size="sm" className="mt-0.5" />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="min-w-0 text-sm">
                              <span className="font-semibold text-fg">{readableAction(event.action)}</span>
                              <span className="text-fg-subtle"> · </span>
                              <span className="text-fg-muted">
                                {areaLabel(event.entity_type)}
                                {event.entity_id ? ` #${event.entity_id}` : ""}
                              </span>
                            </p>
                            <time
                              dateTime={event.occurred_at}
                              title={formatDateTime(event.occurred_at)}
                              className="shrink-0 text-xs tabular-nums text-fg-subtle"
                            >
                              {timeOnly(event.occurred_at)}
                            </time>
                          </div>

                          <p className="mt-0.5 text-sm text-fg">{event.summary}</p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="text-fg-subtle">
                              {event.actor_label}
                              {event.actor_role ? ` (${event.actor_role})` : ""}
                            </span>
                            {/* Success is the norm, so it is a quiet mark; a
                                failure is the thing to notice and gets a badge.
                                Both are stated in text, not by colour. */}
                            {failed ? (
                              <StatusBadge label="Failed" tone="danger" icon={ShieldAlert} />
                            ) : (
                              <span className="inline-flex items-center gap-1 text-success-fg">
                                <CircleCheck size={13} aria-hidden="true" />
                                Succeeded
                              </span>
                            )}
                          </div>

                          {changeCount > 0 && (
                            // Native disclosure: keyboard-operable and announced
                            // as expandable with no script. The values shown are
                            // exactly what the server recorded, which never
                            // includes a secret or a coordinate.
                            <details className="group mt-2">
                              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                                <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
                                {changeCount} field{changeCount === 1 ? "" : "s"} changed
                              </summary>
                              <dl className="mt-2 space-y-1 rounded-lg bg-surface-muted p-3 text-xs">
                                {Object.entries(event.changes!).map(([field, value]) => (
                                  <div key={field} className="flex flex-wrap gap-x-2">
                                    <dt className="font-medium text-fg-muted">{field.replaceAll("_", " ")}</dt>
                                    <dd className="min-w-0 break-words text-fg">{describeChange(value)}</dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            totalItems={data.total}
            onPageChange={setPage}
          />
        )}
      </SectionCard>

      <p className="text-xs text-fg-subtle">
        The audit log never records passwords, password hashes, tokens, QR material or any
        other secret, and it does not record attendance coordinates. Entries are appended
        only: the database refuses any attempt to change or delete one.
      </p>
    </section>
  );
}
