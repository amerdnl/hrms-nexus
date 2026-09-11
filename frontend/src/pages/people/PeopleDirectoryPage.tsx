import { Search, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getDirectory } from "../../api/peopleApi";
import Avatar from "../../components/ui/Avatar";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import Skeleton from "../../components/ui/Skeleton";
import TextInput from "../../components/ui/TextInput";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { DirectoryPage } from "../../types/people";

const PAGE_SIZE = 24;

/**
 * The company directory: everyone working here, as colleagues see them.
 *
 * The server returns the social layer only - name, photo, role, department and
 * skills - and only for people currently employed. Search and the department
 * filter live in the address, so a search result elsewhere can link straight
 * to a filtered directory and the back button behaves.
 */
export default function PeopleDirectoryPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const department = params.get("department") ? Number(params.get("department")) : null;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const debounced = useDebouncedValue(search, 300);

  const [data, setData] = useState<DirectoryPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  // Typing updates the address once the user pauses, not on every keystroke.
  useEffect(() => {
    const current = params.get("search") ?? "";
    if (debounced.trim() === current) return;
    const next = new URLSearchParams(params);
    if (debounced.trim()) next.set("search", debounced.trim()); else next.delete("search");
    next.delete("page");
    setParams(next, { replace: true });
  }, [debounced, params, setParams]);

  useEffect(() => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError("");
    getDirectory({ search: params.get("search") ?? "", department, page, pageSize: PAGE_SIZE })
      .then((result) => { if (id === requestId.current) setData(result); })
      .catch((requestError) => {
        if (id === requestId.current) setError(getApiErrorMessage(requestError, "The directory could not be loaded."));
      })
      .finally(() => { if (id === requestId.current) setIsLoading(false); });
  }, [params, department, page]);

  function setDepartment(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("department", value); else next.delete("department");
    next.delete("page");
    setParams(next);
  }

  function setPage(value: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(value));
    setParams(next);
    window.scrollTo({ top: 0 });
  }

  const filtered = Boolean(params.get("search") || department);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="People"
        description="Everyone at the company. Search by name, role, department or skill."
      />

      <SectionCard>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FormField id="people-search" label="Search">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <TextInput
                id="people-search"
                type="search"
                className="pl-9"
                placeholder="Name, role, department or skill"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
              />
            </div>
          </FormField>
          <FormField id="people-department" label="Department">
            <SelectInput
              id="people-department"
              value={department ? String(department) : ""}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">All departments</option>
              {(data?.departments ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name} ({entry.people})</option>
              ))}
            </SelectInput>
          </FormField>
        </div>
      </SectionCard>

      {/* Announced when results change, so a screen reader user hears the
          count after typing rather than having to find it. */}
      <p className="text-sm text-fg-muted" role="status" aria-live="polite">
        {isLoading ? "Searching…" : data ? `${data.total} ${data.total === 1 ? "person" : "people"}${filtered ? " match" : ""}` : ""}
      </p>

      {error ? (
        <SectionCard>
          <ErrorState title="The directory could not be loaded" description={error} onRetry={() => setParams(new URLSearchParams(params))} />
        </SectionCard>
      ) : isLoading && !data ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="rounded-card border border-line bg-surface p-5 shadow-card">
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="mt-4 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </li>
          ))}
        </ul>
      ) : data && data.people.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Users}
            title={filtered ? "No one matches" : "No one here yet"}
            description={filtered ? "Try a different name, role or skill, or clear the department filter." : "Colleagues appear here once HR adds them."}
          />
        </SectionCard>
      ) : data ? (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.people.map((person) => (
              <li key={person.id}>
                <Link
                  to={`/people/${person.id}`}
                  className="flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Avatar name={person.fullName} src={resolveProfileImageUrl(person.profileImage)} size="lg" />
                  <span className="mt-3 font-semibold text-fg [overflow-wrap:anywhere]">{person.fullName}</span>
                  <span className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">{person.jobTitle ?? "No job title recorded"}</span>
                  <span className="mt-0.5 text-xs text-fg-subtle">{person.departmentName ?? "No department"}</span>
                  {person.skills.length > 0 && (
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {person.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted [overflow-wrap:anywhere]">{skill}</span>
                      ))}
                      {person.skills.length > 3 && (
                        <span className="rounded-full px-1 py-0.5 text-xs text-fg-subtle">+{person.skills.length - 3} more</span>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            totalItems={data.total}
            onPageChange={setPage}
            className="rounded-card border border-line bg-surface shadow-card"
          />
        </>
      ) : null}
    </section>
  );
}
