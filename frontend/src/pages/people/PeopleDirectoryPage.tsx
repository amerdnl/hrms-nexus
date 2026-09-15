import {
  Ellipsis,
  Eye,
  IdCard,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getDepartments } from "../../api/departmentApi";
import { getEmployeeJobTitles, getEmployees } from "../../api/employeeApi";
import { getDirectory, getOrgChart } from "../../api/peopleApi";
import { isEmployed, useEmploymentAction } from "../../components/people/useEmploymentAction";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DropdownMenu from "../../components/ui/DropdownMenu";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import Skeleton from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import { useAuth } from "../../context/useAuth";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { employmentStatusLabels, employmentStatuses } from "../../types/employee";
import { cn } from "../../utils/cn";
import { employmentStatusMeta } from "../../utils/status";

const PAGE_SIZE = 24;
/** The last layout chosen, per browser. The address still wins when it names one. */
const VIEW_STORAGE_KEY = "hr_nexus_people_view";

type View = "grid" | "list";

/**
 * One person as either view draws them. Both roles fill the same shape from
 * the endpoint they are allowed to call, so the grid, the list and the phone
 * cards never branch on where a field came from.
 */
interface Row {
  id: number;
  fullName: string;
  profileImage: string | null;
  jobTitle: string | null;
  departmentName: string | null;
  skills: string[];
  /** HR only. The colleague directory never sends a record number or status. */
  employeeNumber: string | null;
  employmentStatus: string | null;
  /** Undefined while not yet known; null when no manager is recorded. */
  managerName: string | null | undefined;
}

interface Results {
  rows: Row[];
  total: number;
  /** The colleague directory's department counts; HR's options load separately. */
  departments: Array<{ value: string; label: string }> | null;
}

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/**
 * People: the one company directory.
 *
 * Everyone browses it as a grid of people or a denser list, and searches and
 * filters it the same way in both. What each role reads is decided by the
 * server, not here:
 *
 * - A colleague's view is the social directory (GET /people): people currently
 *   employed, with name, photo, role, department and skills. Manager names in
 *   the list come from the org chart, which every account may already see.
 * - HR's view is the employee records list (GET /employees), which was the
 *   separate Employees page: every status, the employee number, status and
 *   job-title filters, Add employee, and a menu per person to open the HR
 *   record, edit it, or deactivate or reactivate it.
 *
 * Search, filters, page and layout live in the address, so a link elsewhere
 * can open a filtered directory and the back button behaves.
 */
export default function PeopleDirectoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const searchParam = params.get("search") ?? "";
  const department = params.get("department") ?? "";
  const status = isAdmin ? params.get("status") ?? "" : "";
  const jobTitle = isAdmin ? params.get("title") ?? "" : "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const viewParam = params.get("view");
  const view: View = viewParam === "list" || viewParam === "grid" ? viewParam : storedView();

  const [search, setSearch] = useState(searchParam);
  const debounced = useDebouncedValue(search, 300);

  const [results, setResults] = useState<Results | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const requestId = useRef(0);

  const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [managers, setManagers] = useState<Map<number, string | null> | "failed" | null>(null);

  const employment = useEmploymentAction(() => setReload((count) => count + 1));

  const update = useCallback(
    (changes: Record<string, string | null>, options: { keepPage?: boolean; replace?: boolean } = {}) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!options.keepPage) next.delete("page");
        return next;
      }, { replace: options.replace });
    },
    [setParams],
  );

  // Typing reaches the address once the user pauses, not on every keystroke.
  const lastSearch = useRef(debounced);
  useEffect(() => {
    if (debounced === lastSearch.current) return;
    lastSearch.current = debounced;
    update({ search: debounced.trim() || null }, { replace: true });
  }, [debounced, update]);

  useEffect(() => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError("");

    const load: Promise<Results> = isAdmin
      ? getEmployees({
          search: searchParam || undefined,
          department: department || undefined,
          employment_status: status || undefined,
          job_title: jobTitle || undefined,
          page,
          page_size: PAGE_SIZE,
        }).then((result) => ({
          total: result.total,
          departments: null,
          rows: result.employees.map((employee) => ({
            id: employee.id,
            fullName: employee.fullName,
            profileImage: employee.profileImage,
            jobTitle: employee.jobTitle,
            departmentName: employee.departmentName,
            skills: [],
            employeeNumber: employee.employeeNumber,
            employmentStatus: employee.employmentStatus,
            managerName: employee.managerName,
          })),
        }))
      : getDirectory({ search: searchParam, department: department ? Number(department) : null, page, pageSize: PAGE_SIZE })
          .then((result) => ({
            total: result.total,
            departments: result.departments.map((entry) => ({ value: String(entry.id), label: `${entry.name} (${entry.people})` })),
            rows: result.people.map((person) => ({
              id: person.id,
              fullName: person.fullName,
              profileImage: person.profileImage,
              jobTitle: person.jobTitle,
              departmentName: person.departmentName,
              skills: person.skills,
              employeeNumber: null,
              employmentStatus: null,
              managerName: undefined,
            })),
          }));

    load
      .then((next) => {
        if (id !== requestId.current) return;
        setResults(next);
        if (next.departments) setDepartmentOptions(next.departments);
      })
      .catch((requestError) => {
        if (id === requestId.current) setError(getApiErrorMessage(requestError, "The directory could not be loaded."));
      })
      .finally(() => {
        if (id === requestId.current) setIsLoading(false);
      });
  }, [isAdmin, searchParam, department, status, jobTitle, page, reload]);

  // A deactivation or a narrower filter can leave the page past the end.
  useEffect(() => {
    if (!results) return;
    const last = Math.max(1, Math.ceil(results.total / PAGE_SIZE));
    if (page > last) update({ page: last > 1 ? String(last) : null }, { keepPage: true, replace: true });
  }, [results, page, update]);

  // HR's filter options cover every record, not only the rows on this page.
  useEffect(() => {
    if (!isAdmin) return;
    getDepartments()
      .then((list) => setDepartmentOptions(list.map((entry) => ({ value: String(entry.id), label: entry.name }))))
      .catch(() => setDepartmentOptions([]));
    getEmployeeJobTitles().then(setJobTitles).catch(() => setJobTitles([]));
  }, [isAdmin]);

  // A colleague's list names each person's manager from the org chart, which
  // every account can already open. Loaded the first time the list is shown.
  useEffect(() => {
    if (isAdmin || view !== "list" || managers !== null) return;
    getOrgChart()
      .then((nodes) => {
        const names = new Map(nodes.map((node) => [node.id, node.fullName]));
        setManagers(new Map(nodes.map((node) => [node.id, node.managerId === null ? null : names.get(node.managerId) ?? null])));
      })
      .catch(() => setManagers("failed"));
  }, [isAdmin, view, managers]);

  function setView(next: View) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // A remembered layout is a convenience; the address still carries it.
    }
    update({ view: next }, { keepPage: true, replace: true });
  }

  function setPage(value: number) {
    update({ page: value > 1 ? String(value) : null }, { keepPage: true });
    window.scrollTo({ top: 0 });
  }

  function clearFilters() {
    setSearch("");
    update({ search: null, department: null, status: null, title: null });
  }

  const filtered = Boolean(searchParam || department || status || jobTitle);
  // When the chart cannot be read, the column is left out rather than filled
  // with dashes that would read as "no manager".
  const showManager = isAdmin || managers !== "failed";
  const rows = (results?.rows ?? []).map((row) =>
    !isAdmin && managers instanceof Map ? { ...row, managerName: managers.get(row.id) ?? null } : row,
  );

  function openRow(event: MouseEvent<HTMLTableRowElement>, id: number) {
    // The name is the real link and the menu has its own buttons; the rest of
    // the row is a larger target for a pointer.
    if ((event.target as HTMLElement).closest("a, button, [role='menu']")) return;
    navigate(`/people/${id}`);
  }

  function hrMenu(row: Row) {
    const employed = isEmployed(row.employmentStatus);
    return (
      <DropdownMenu
        label={`Actions for ${row.fullName}`}
        className="h-9 w-9"
        trigger={<Ellipsis size={18} aria-hidden="true" />}
        items={[
          { key: "profile", label: "View profile", icon: <Eye size={16} aria-hidden="true" />, onSelect: () => navigate(`/people/${row.id}`) },
          { key: "record", label: "Open HR record", icon: <IdCard size={16} aria-hidden="true" />, onSelect: () => navigate(`/admin/employees/${row.id}`) },
          { key: "edit", label: "Edit employee", icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => navigate(`/admin/employees/${row.id}/edit`) },
          {
            key: "status",
            label: employed ? "Deactivate" : "Reactivate",
            icon: employed ? <UserMinus size={16} aria-hidden="true" /> : <UserCheck size={16} aria-hidden="true" />,
            tone: employed ? "danger" : "default",
            onSelect: () =>
              employment.request({ id: row.id, fullName: row.fullName, employmentStatus: row.employmentStatus ?? "" }),
          },
        ]}
      />
    );
  }

  const managerCell = (row: Row) =>
    row.managerName === undefined
      ? <Skeleton className="h-3.5 w-24" />
      : row.managerName ?? "—";

  const emptyState = filtered ? (
    <EmptyState
      icon={Users}
      title="No one matches"
      description={isAdmin
        ? "Try another name, employee number or email, or clear the filters."
        : "Try a different name, role or skill, or clear the department filter."}
      action={<Button variant="secondary" size="sm" onClick={clearFilters}>Clear all filters</Button>}
    />
  ) : (
    <EmptyState
      icon={Users}
      title={isAdmin ? "No employee records yet" : "No one here yet"}
      description={isAdmin ? "Add the first employee to start the directory." : "Colleagues appear here once HR adds them."}
      action={isAdmin ? <LinkButton to="/admin/employees/new" variant="secondary" size="sm" icon={Plus}>Add employee</LinkButton> : undefined}
    />
  );

  const headers = [
    "Employee",
    "Job title",
    "Department",
    ...(showManager ? ["Manager"] : []),
    // The label is absolutely positioned (sr-only); the relative wrapper keeps
    // it inside the table's scroll region instead of widening the page.
    ...(isAdmin ? ["Status", <span key="actions" className="relative"><span className="sr-only">Actions</span></span>] : []),
  ];

  const total = results?.total ?? 0;

  return (
    <section className="max-w-7xl space-y-6">
      <PageHeader
        title="People"
        description={isAdmin
          ? "Everyone with an employee record, current and former. Open a profile, or manage a record from its menu."
          : "Everyone at the company. Search by name, role, department or skill."}
        actions={isAdmin ? <LinkButton to="/admin/employees/new" icon={Plus}>Add employee</LinkButton> : undefined}
        area="people"
      />

      {employment.error && <Alert tone="danger" onDismiss={employment.clearError}>{employment.error}</Alert>}
      {employment.notice && <Alert tone="success" onDismiss={employment.clearNotice}>{employment.notice}</Alert>}

      <SectionCard>
        <div
          className={cn(
            "grid gap-4",
            isAdmin
              ? "sm:grid-cols-2 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]"
              : "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
          )}
        >
          <FormField id="people-search" label="Search">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <TextInput
                id="people-search"
                type="search"
                className="pl-9"
                placeholder={isAdmin ? "Name, employee number or email" : "Name, role, department or skill"}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
              />
            </div>
          </FormField>
          <FormField id="people-department" label="Department">
            <SelectInput
              id="people-department"
              value={department}
              onChange={(event) => update({ department: event.target.value || null })}
            >
              <option value="">All departments</option>
              {departmentOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </SelectInput>
          </FormField>
          {isAdmin && (
            <FormField id="people-status" label="Employment status">
              <SelectInput id="people-status" value={status} onChange={(event) => update({ status: event.target.value || null })}>
                <option value="">All statuses</option>
                {employmentStatuses.map((value) => (
                  <option key={value} value={value}>{employmentStatusLabels[value]}</option>
                ))}
              </SelectInput>
            </FormField>
          )}
          {isAdmin && (
            <FormField id="people-title" label="Job title">
              <SelectInput id="people-title" value={jobTitle} onChange={(event) => update({ title: event.target.value || null })}>
                <option value="">All job titles</option>
                {/* The current choice stays listed even before the options load. */}
                {(jobTitle && !jobTitles.includes(jobTitle) ? [...jobTitles, jobTitle] : jobTitles).map((title) => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </SelectInput>
            </FormField>
          )}
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Announced when results change, so a screen reader user hears the
            count after typing rather than having to find it. */}
        <p className="text-sm text-fg-muted" role="status" aria-live="polite">
          {isLoading
            ? "Searching…"
            : results
              ? `${total} ${total === 1 ? "person" : "people"}${filtered ? (total === 1 ? " matches" : " match") : ""}`
              : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {filtered && (
            <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear filters</Button>
          )}
          <div role="group" aria-label="Layout" className="inline-flex rounded-xl border border-control-border bg-surface p-0.5">
            {([["grid", "Grid", LayoutGrid], ["list", "List", List]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-[0.625rem] px-3 text-sm font-medium transition-colors pointer-coarse:min-h-10",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  view === value ? "bg-primary-soft text-primary" : "text-fg-muted hover:text-fg",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <SectionCard>
          <ErrorState title="The directory could not be loaded" description={error} onRetry={() => setReload((count) => count + 1)} />
        </SectionCard>
      ) : view === "grid" ? (
        !results ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className="flex flex-col items-center rounded-card border border-line bg-surface px-5 pb-5 pt-6 shadow-card">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="mt-4 h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <SectionCard>{emptyState}</SectionCard>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={isLoading || undefined}>
            {rows.map((row) => (
              <li key={row.id} className="relative">
                <Link
                  to={`/people/${row.id}`}
                  className="flex h-full flex-col items-center rounded-card border border-line bg-surface px-5 pb-5 pt-6 text-center shadow-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Avatar name={row.fullName} src={resolveProfileImageUrl(row.profileImage)} size="xl" />
                  <span className="mt-3 font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{row.fullName}</span>
                  <span className="mt-1 text-sm text-fg-muted [overflow-wrap:anywhere]">{row.jobTitle ?? "No job title recorded"}</span>
                  <span className="mt-0.5 text-xs text-fg-subtle [overflow-wrap:anywhere]">{row.departmentName ?? "No department"}</span>
                  {/* Only a status worth noticing: "Active" on every card is noise. */}
                  {row.employmentStatus && row.employmentStatus !== "active" && (
                    <span className="mt-3"><StatusBadge {...employmentStatusMeta(row.employmentStatus)} /></span>
                  )}
                  {row.skills.length > 0 && (
                    <span className="mt-3 flex flex-wrap justify-center gap-1.5">
                      {row.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted [overflow-wrap:anywhere]">{skill}</span>
                      ))}
                      {row.skills.length > 3 && (
                        <span className="rounded-full px-1 py-0.5 text-xs text-fg-subtle">+{row.skills.length - 3} more</span>
                      )}
                    </span>
                  )}
                </Link>
                {/* Beside the link, not inside it: a button within an anchor
                    is invalid and unreachable by keyboard. */}
                {isAdmin && <div className="absolute right-2 top-2">{hrMenu(row)}</div>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          headers={headers}
          caption="People matching the current search and filters"
          // HR's six columns fit the 834 tablet column without scrolling, so the
          // row menus stay in view; narrower than that, the table scrolls.
          minWidthClass={isAdmin ? "min-w-195" : "min-w-160"}
          isLoading={!results}
          loadingLabel="Loading people..."
          isEmpty={rows.length === 0}
          emptyState={emptyState}
          mobileCards={rows.map((row) => (
            <RecordCard
              key={row.id}
              to={`/people/${row.id}`}
              leading={<Avatar name={row.fullName} src={resolveProfileImageUrl(row.profileImage)} size="md" />}
              title={row.fullName}
              subtitle={row.jobTitle ?? "No job title recorded"}
              badge={row.employmentStatus ? <StatusBadge {...employmentStatusMeta(row.employmentStatus)} /> : undefined}
              meta={[
                { label: "Department", value: row.departmentName ?? "—" },
                ...(showManager ? [{ label: "Manager", value: managerCell(row) }] : []),
              ]}
              actions={isAdmin ? hrMenu(row) : undefined}
            />
          ))}
        >
          {rows.map((row) => (
            <tr key={row.id} className="cursor-pointer transition-colors hover:bg-surface-muted" onClick={(event) => openRow(event, row.id)}>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={row.fullName} src={resolveProfileImageUrl(row.profileImage)} size="sm" />
                  <div className="min-w-0">
                    <Link
                      to={`/people/${row.id}`}
                      className="font-medium text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
                    >
                      {row.fullName}
                    </Link>
                    {row.employeeNumber && <p className="mt-0.5 truncate text-xs text-fg-subtle">{row.employeeNumber}</p>}
                  </div>
                </div>
              </td>
              <td className="px-5 py-3 text-fg-muted">{row.jobTitle ?? "—"}</td>
              <td className="px-5 py-3 text-fg-muted">{row.departmentName ?? "—"}</td>
              {showManager && <td className="px-5 py-3 text-fg-muted">{managerCell(row)}</td>}
              {isAdmin && (
                <td className="px-5 py-3">
                  {row.employmentStatus && <StatusBadge {...employmentStatusMeta(row.employmentStatus)} />}
                </td>
              )}
              {isAdmin && (
                <td className="px-5 py-3">
                  <div className="flex justify-end">{hrMenu(row)}</div>
                </td>
              )}
            </tr>
          ))}
        </DataTable>
      )}

      {results && rows.length > 0 && (
        <Pagination
          page={Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)))}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          className="rounded-card border border-line bg-surface shadow-card"
        />
      )}

      {employment.dialog}
    </section>
  );
}
