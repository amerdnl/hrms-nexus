import { Contact, Pencil, UsersRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getEmployeeById } from "../../api/employeeApi";
import EmployeeLifecycleCard from "../../components/lifecycle/EmployeeLifecycleCard";
import Avatar from "../../components/ui/Avatar";
import DescriptionList, {
  type DescriptionEntry,
} from "../../components/ui/DescriptionList";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs, { type TabItem } from "../../components/ui/Tabs";
import type { Employee } from "../../types/employee";
import { formatDate } from "../../utils/datetime";
import { employmentStatusMeta } from "../../utils/status";

/**
 * Three tabs, matching the references.
 *
 * Deliberately NOT the reference's six. Documents, Leave & attendance and
 * Payroll are all shown there; this application has no document storage, and
 * the other two would need endpoints this page does not call. An empty tab is
 * worse than an absent one - it reads as a broken feature rather than one that
 * was never claimed.
 */
const TABS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "employment", label: "Employment" },
];

/** The manager as a link to their own record, or nothing recorded. */
function managerLink(employee: Employee): ReactNode {
  if (employee.managerId === null) return null;
  return (
    <Link
      to={`/admin/employees/${employee.managerId}`}
      className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {employee.managerName ?? `Employee #${employee.managerId}`}
    </Link>
  );
}

function panelFor(employee: Employee, tab: string): DescriptionEntry[] {
  const date = (value: string | null) => (value ? formatDate(value) : null);

  if (tab === "personal") {
    return [
      { label: "Phone", value: employee.phone },
      { label: "Gender", value: employee.gender },
      { label: "Date of birth", value: date(employee.dateOfBirth) },
      { label: "Email", value: employee.email ?? null },
      { label: "Emergency contact", value: employee.emergencyContactName },
      { label: "Emergency contact phone", value: employee.emergencyContactPhone },
      { label: "Address", value: employee.address, wide: true },
    ];
  }

  if (tab === "employment") {
    return [
      { label: "Employee number", value: employee.employeeNumber },
      { label: "Job title", value: employee.jobTitle },
      { label: "Department", value: employee.departmentName },
      { label: "Reports to", value: managerLink(employee) },
      { label: "Employment date", value: date(employee.employmentDate) },
      {
        label: "Employment status",
        value: <StatusBadge {...employmentStatusMeta(employee.employmentStatus)} />,
      },
      { label: "Record created", value: date(employee.createdAt) },
    ];
  }

  // Overview: the handful of fields someone opening this record most likely
  // came for, not a copy of the other two tabs.
  return [
    { label: "Employee number", value: employee.employeeNumber },
    { label: "Job title", value: employee.jobTitle },
    { label: "Department", value: employee.departmentName },
    { label: "Reports to", value: managerLink(employee) },
    { label: "Employment date", value: date(employee.employmentDate) },
    { label: "Phone", value: employee.phone },
    { label: "Emergency contact", value: employee.emergencyContactName },
  ];
}

export default function EmployeeDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function loadEmployee() {
      if (!id) {
        setError("Employee ID is missing.");
        setIsLoading(false);
        return;
      }

      try {
        const data = await getEmployeeById(Number(id));
        setEmployee(data);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load employee."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadEmployee();
  }, [id]);

  // The page keeps its header and its shape while loading rather than
  // collapsing to a line of text, so nothing jumps when the record arrives.
  if (isLoading) {
    return (
      <section className="max-w-4xl space-y-6">
        <PageHeader
          title="Employee details"
          description="View employee information."
          backTo={`/people/${id}`}
          backLabel="Back to profile"
        />
        <SectionCard>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          </div>
        </SectionCard>
        <SectionCard>
          <SkeletonText lines={6} />
        </SectionCard>
      </section>
    );
  }

  if (error || !employee) {
    return (
      <section className="max-w-4xl space-y-6">
        <PageHeader
          title="Employee details"
          backTo={`/people/${id}`}
          backLabel="Back to profile"
        />
        <SectionCard>
          <ErrorState
            title="This employee could not be loaded"
            description={error || "The record is unavailable."}
          />
        </SectionCard>
      </section>
    );
  }

  const statusMeta = employmentStatusMeta(employee.employmentStatus);

  return (
    <section className="max-w-4xl space-y-6">
      <PageHeader
        title="Employee details"
        description="View employee information."
        backTo={`/people/${id}`}
        backLabel="Back to profile"
        actions={
          <>
            {["active", "probation"].includes(employee.employmentStatus) && (
              <LinkButton to={`/people/${employee.id}`} icon={Contact} variant="secondary">
                Colleague profile
              </LinkButton>
            )}
            <LinkButton to={`/admin/employees/${employee.id}/edit`} icon={Pencil}>
              Edit employee
            </LinkButton>
          </>
        }
      />

      {/* Identity header. The name, face and status belong above the tabs,
          not inside one: they are what identifies the record you are reading,
          so switching tab must not change or hide them. */}
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar
            name={employee.fullName}
            src={resolveProfileImageUrl(employee.profileImage)}
            size="xl"
            className="mx-auto sm:mx-0"
          />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold tracking-tight text-fg [overflow-wrap:anywhere]">
              {employee.fullName}
            </h2>
            <p className="mt-1 text-sm text-fg-muted [overflow-wrap:anywhere]">
              {[employee.jobTitle, employee.departmentName]
                .filter(Boolean)
                .join(" · ") || "No job title recorded"}
            </p>
            <p className="mt-0.5 truncate text-xs text-fg-subtle">
              {employee.employeeNumber}
            </p>
          </div>

          <div className="flex justify-center sm:justify-end">
            <StatusBadge {...statusMeta} />
          </div>
        </div>
      </SectionCard>

      <div>
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* The panel half of the ARIA relationship Tabs documents. */}
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {/* No card title: the selected tab already names this panel and
              labels it for assistive technology, so a heading repeating it
              was the same word twice. */}
          <SectionCard className="mt-4">
            <DescriptionList items={panelFor(employee, activeTab)} />
          </SectionCard>
        </div>
      </div>

      <EmployeeLifecycleCard
        employeeId={employee.id}
        employeeName={employee.fullName}
        employed={["active", "probation"].includes(employee.employmentStatus)}
      />

      {/* Every direct report, current or former: this is the HR record, and a
          former report is still part of what an administrator reviews. */}
      <SectionCard
        title="Direct reports"
        description={
          (employee.directReports?.length ?? 0) === 0
            ? `No one reports to ${employee.fullName}.`
            : undefined
        }
        icon={UsersRound}
        padded={(employee.directReports?.length ?? 0) > 0}
      >
        {(employee.directReports?.length ?? 0) > 0 && (
          <ul className="divide-y divide-line">
            {employee.directReports!.map((report) => (
              <li key={report.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={report.fullName} size="sm" />
                <div className="min-w-0">
                  <Link
                    to={`/admin/employees/${report.id}`}
                    className="text-sm font-medium text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
                  >
                    {report.fullName}
                  </Link>
                  <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
                    {[report.jobTitle, report.employeeNumber].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <StatusBadge {...employmentStatusMeta(report.employmentStatus)} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </section>
  );
}
