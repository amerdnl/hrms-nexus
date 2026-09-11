/** Human wording for stored employment statuses, for titles and summaries. */
const labels: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  inactive: "Inactive",
  resigned: "Resigned",
  terminated: "Terminated",
};

export function employmentStatusLabel(status: string): string {
  return labels[status] ?? status;
}
