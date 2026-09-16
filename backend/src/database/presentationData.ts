/**
 * The presentation dataset: Meridian Digital Solutions Sdn. Bhd., a fictional
 * Kuala Lumpur product studio that looks as though it has run HR Nexus for
 * months.
 *
 * Everything here is invented. Addresses use the `.invalid` top-level domain,
 * which RFC 2606 reserves so it can never resolve to a real mailbox; no name,
 * number, salary or identifier belongs to a real person or company.
 *
 * DATES. Only history that is genuinely fixed - employment dates, the 2026
 * public-holiday calendar, payroll months - is written as a calendar date.
 * Everything a viewer reads as "now" is a function of the company's own today,
 * so the environment stays coherent on whichever day it is shown.
 *
 * The dataset is a description, separate from the loader that writes it, so
 * what the presentation contains can be reviewed without reading SQL.
 */

/** Reserved identifier range. The loader never touches a row outside it. */
export const PRESENTATION_ID_MIN = 9200;
export const PRESENTATION_ID_MAX = 9299;

export const presentationCompany = {
  name: "Meridian Digital Solutions Sdn. Bhd.",
  shortName: "Meridian Digital",
  timezone: "Asia/Kuala_Lumpur",
  workingDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "18:00",
  graceMinutes: 15,
  // Fictional office coordinates in the Kuala Lumpur city centre.
  officeLatitude: 3.1528,
  officeLongitude: 101.7133,
  radiusMeters: 150,
};

export interface PresentationDepartment {
  name: string;
  description: string;
}

export const presentationDepartments: PresentationDepartment[] = [
  { name: "Leadership", description: "Company direction, and the heads of each department" },
  { name: "Engineering", description: "Platform and application engineering, quality and delivery" },
  { name: "Product & Design", description: "Product management, design and user research" },
  { name: "People & Culture", description: "Hiring, onboarding, employee experience and policy" },
  { name: "Finance", description: "Payroll operations, accounting and financial reporting" },
  { name: "Sales & Partnerships", description: "New business, account management and partner programmes" },
  { name: "Operations & Customer Success", description: "Service delivery, customer success and internal operations" },
];

export interface PresentationEmployee {
  id: number;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  status: "active" | "probation" | "inactive" | "resigned";
  employmentDate: string;
  /** Sen per month. Omitted only for someone who should have no compensation record. */
  basicSalarySen?: number;
  allowanceSen?: number;
  overtimeRateSen?: number;
  account?: "admin" | "employee";
  managerId?: number;
}

/**
 * Thirty-four people across seven departments and four levels: the managing
 * director, six department heads, five managers and team leads, and the
 * individual contributors who do the work. Salaries vary by level and by
 * person, as they do in a real company.
 */
export const presentationEmployees: PresentationEmployee[] = [
  // ------------------------------------------------------------- Leadership
  { id: 9201, employeeNumber: "MDS-001", fullName: "Azman bin Rahim", department: "Leadership", jobTitle: "Managing Director", status: "active", employmentDate: "2018-03-05", basicSalarySen: 3200000, allowanceSen: 420000, overtimeRateSen: 0 },

  // ------------------------------------------------------------ Engineering
  { id: 9202, employeeNumber: "MDS-002", fullName: "Lim Wei Sheng", department: "Engineering", jobTitle: "Head of Engineering", status: "active", employmentDate: "2019-01-14", basicSalarySen: 1780000, allowanceSen: 220000, overtimeRateSen: 0, managerId: 9201 },
  // The manager the presentation walks through: a real reporting line, five reports.
  { id: 9203, employeeNumber: "MDS-003", fullName: "Nur Hidayah binti Roslan", department: "Engineering", jobTitle: "Engineering Manager, Platform", status: "active", employmentDate: "2020-06-01", basicSalarySen: 1285000, allowanceSen: 150000, overtimeRateSen: 0, account: "employee", managerId: 9202 },
  { id: 9204, employeeNumber: "MDS-004", fullName: "Arvind Menon", department: "Engineering", jobTitle: "Senior Software Engineer", status: "active", employmentDate: "2020-11-09", basicSalarySen: 1040000, allowanceSen: 95000, overtimeRateSen: 6900, managerId: 9203 },
  // The employee the presentation walks through, inside that manager's team.
  { id: 9205, employeeNumber: "MDS-005", fullName: "Chong Kar Wai", department: "Engineering", jobTitle: "Software Engineer", status: "active", employmentDate: "2022-02-14", basicSalarySen: 785000, allowanceSen: 70000, overtimeRateSen: 5200, account: "employee", managerId: 9203 },
  { id: 9206, employeeNumber: "MDS-006", fullName: "Siti Balqis binti Azmi", department: "Engineering", jobTitle: "Software Engineer", status: "active", employmentDate: "2022-09-05", basicSalarySen: 742000, allowanceSen: 65000, overtimeRateSen: 4900, managerId: 9203 },
  { id: 9207, employeeNumber: "MDS-007", fullName: "Tan Yi Xuan", department: "Engineering", jobTitle: "QA Engineer", status: "active", employmentDate: "2023-03-13", basicSalarySen: 638000, allowanceSen: 55000, overtimeRateSen: 4250, managerId: 9203 },
  { id: 9208, employeeNumber: "MDS-008", fullName: "Haziq bin Kamarul", department: "Engineering", jobTitle: "Junior Software Engineer", status: "probation", employmentDate: "2026-07-06", basicSalarySen: 452000, allowanceSen: 35000, overtimeRateSen: 3000, managerId: 9203 },
  { id: 9209, employeeNumber: "MDS-009", fullName: "Rebecca Anne Fernandez", department: "Engineering", jobTitle: "Engineering Manager, Applications", status: "active", employmentDate: "2021-04-12", basicSalarySen: 1245000, allowanceSen: 145000, overtimeRateSen: 0, managerId: 9202 },
  { id: 9210, employeeNumber: "MDS-010", fullName: "Mohd Faiz bin Ibrahim", department: "Engineering", jobTitle: "Senior Software Engineer", status: "active", employmentDate: "2021-08-23", basicSalarySen: 995000, allowanceSen: 90000, overtimeRateSen: 6600, managerId: 9209 },
  { id: 9211, employeeNumber: "MDS-011", fullName: "Yeoh Sze Ming", department: "Engineering", jobTitle: "Software Engineer", status: "active", employmentDate: "2023-10-02", basicSalarySen: 706000, allowanceSen: 62000, overtimeRateSen: 4700, managerId: 9209 },
  { id: 9212, employeeNumber: "MDS-012", fullName: "Kavitha Raman", department: "Engineering", jobTitle: "DevOps Engineer", status: "active", employmentDate: "2022-05-16", basicSalarySen: 862000, allowanceSen: 78000, overtimeRateSen: 5750, managerId: 9209 },

  // ------------------------------------------------------- Product & Design
  { id: 9213, employeeNumber: "MDS-013", fullName: "Lai Mun Yee", department: "Product & Design", jobTitle: "Head of Product & Design", status: "active", employmentDate: "2019-07-01", basicSalarySen: 1615000, allowanceSen: 190000, overtimeRateSen: 0, managerId: 9201 },
  { id: 9214, employeeNumber: "MDS-014", fullName: "Danial Hakim bin Omar", department: "Product & Design", jobTitle: "Product Manager", status: "active", employmentDate: "2021-10-18", basicSalarySen: 1085000, allowanceSen: 105000, overtimeRateSen: 0, managerId: 9213 },
  { id: 9215, employeeNumber: "MDS-015", fullName: "Grace Ooi Hui Shan", department: "Product & Design", jobTitle: "Senior Product Designer", status: "active", employmentDate: "2022-03-21", basicSalarySen: 918000, allowanceSen: 84000, overtimeRateSen: 0, managerId: 9213 },
  { id: 9216, employeeNumber: "MDS-016", fullName: "Iskandar bin Jamal", department: "Product & Design", jobTitle: "Product Designer", status: "active", employmentDate: "2024-01-15", basicSalarySen: 672000, allowanceSen: 58000, overtimeRateSen: 0, managerId: 9215 },
  { id: 9217, employeeNumber: "MDS-017", fullName: "Ng Jia Hui", department: "Product & Design", jobTitle: "UX Researcher", status: "active", employmentDate: "2023-06-05", basicSalarySen: 748000, allowanceSen: 64000, overtimeRateSen: 0, managerId: 9213 },

  // -------------------------------------------------------- People & Culture
  { id: 9218, employeeNumber: "MDS-018", fullName: "Farah Izzati binti Hassan", department: "People & Culture", jobTitle: "Head of People & Culture", status: "active", employmentDate: "2019-09-02", basicSalarySen: 1520000, allowanceSen: 175000, overtimeRateSen: 0, managerId: 9201 },
  { id: 9219, employeeNumber: "MDS-019", fullName: "Melissa Tan Sook Yee", department: "People & Culture", jobTitle: "People Operations Executive", status: "active", employmentDate: "2022-08-08", basicSalarySen: 615000, allowanceSen: 52000, overtimeRateSen: 4100, managerId: 9218 },
  { id: 9220, employeeNumber: "MDS-020", fullName: "Ridzuan bin Salleh", department: "People & Culture", jobTitle: "Talent Acquisition Specialist", status: "active", employmentDate: "2023-11-13", basicSalarySen: 682000, allowanceSen: 58000, overtimeRateSen: 4550, managerId: 9218 },
  { id: 9221, employeeNumber: "MDS-021", fullName: "Anisha Kaur", department: "People & Culture", jobTitle: "People Operations Assistant", status: "probation", employmentDate: "2026-08-03", basicSalarySen: 428000, allowanceSen: 32000, overtimeRateSen: 2850, managerId: 9219 },

  // ----------------------------------------------------------------- Finance
  { id: 9222, employeeNumber: "MDS-022", fullName: "Ong Chee Keong", department: "Finance", jobTitle: "Finance Manager", status: "active", employmentDate: "2019-05-06", basicSalarySen: 1435000, allowanceSen: 160000, overtimeRateSen: 0, managerId: 9201 },
  { id: 9223, employeeNumber: "MDS-023", fullName: "Nadhirah binti Zulkarnain", department: "Finance", jobTitle: "Payroll Executive", status: "active", employmentDate: "2021-12-06", basicSalarySen: 725000, allowanceSen: 62000, overtimeRateSen: 4800, managerId: 9222 },
  { id: 9224, employeeNumber: "MDS-024", fullName: "Vimal Raj Krishnan", department: "Finance", jobTitle: "Accounts Executive", status: "active", employmentDate: "2023-02-20", basicSalarySen: 596000, allowanceSen: 48000, overtimeRateSen: 3950, managerId: 9222 },
  { id: 9225, employeeNumber: "MDS-025", fullName: "Low Pei Shan", department: "Finance", jobTitle: "Finance Analyst", status: "active", employmentDate: "2024-07-08", basicSalarySen: 658000, allowanceSen: 54000, overtimeRateSen: 4350, managerId: 9222 },

  // ------------------------------------------------------ Sales & Partnerships
  { id: 9226, employeeNumber: "MDS-026", fullName: "Marcus Teoh Wei Liang", department: "Sales & Partnerships", jobTitle: "Sales Director", status: "active", employmentDate: "2019-02-11", basicSalarySen: 1690000, allowanceSen: 240000, overtimeRateSen: 0, managerId: 9201 },
  { id: 9227, employeeNumber: "MDS-027", fullName: "Sharifah binti Yahya", department: "Sales & Partnerships", jobTitle: "Senior Account Manager", status: "active", employmentDate: "2021-06-14", basicSalarySen: 952000, allowanceSen: 130000, overtimeRateSen: 0, managerId: 9226 },
  { id: 9228, employeeNumber: "MDS-028", fullName: "Jonathan Lee Zhi Wei", department: "Sales & Partnerships", jobTitle: "Account Manager", status: "active", employmentDate: "2022-11-28", basicSalarySen: 788000, allowanceSen: 105000, overtimeRateSen: 0, managerId: 9226 },
  { id: 9229, employeeNumber: "MDS-029", fullName: "Amirul Hakimi bin Nasir", department: "Sales & Partnerships", jobTitle: "Partnerships Executive", status: "active", employmentDate: "2024-03-04", basicSalarySen: 645000, allowanceSen: 72000, overtimeRateSen: 0, managerId: 9226 },
  { id: 9230, employeeNumber: "MDS-030", fullName: "Chan Li Wen", department: "Sales & Partnerships", jobTitle: "Sales Development Representative", status: "active", employmentDate: "2025-01-13", basicSalarySen: 512000, allowanceSen: 60000, overtimeRateSen: 3400, managerId: 9227 },

  // --------------------------------------------- Operations & Customer Success
  { id: 9231, employeeNumber: "MDS-031", fullName: "Devi Suresh", department: "Operations & Customer Success", jobTitle: "Head of Operations & Customer Success", status: "active", employmentDate: "2020-02-17", basicSalarySen: 1480000, allowanceSen: 168000, overtimeRateSen: 0, managerId: 9201 },
  { id: 9232, employeeNumber: "MDS-032", fullName: "Zulkifli bin Hamzah", department: "Operations & Customer Success", jobTitle: "Customer Success Manager", status: "active", employmentDate: "2021-09-06", basicSalarySen: 925000, allowanceSen: 88000, overtimeRateSen: 6150, managerId: 9231 },
  { id: 9233, employeeNumber: "MDS-033", fullName: "Priya Lakshmi Naidu", department: "Operations & Customer Success", jobTitle: "Customer Success Executive", status: "active", employmentDate: "2023-08-14", basicSalarySen: 624000, allowanceSen: 52000, overtimeRateSen: 4150, managerId: 9232 },
  // Leaving at the end of the month: the offboarding the presentation shows.
  { id: 9234, employeeNumber: "MDS-034", fullName: "Wong Kah Meng", department: "Operations & Customer Success", jobTitle: "Operations Executive", status: "active", employmentDate: "2022-06-20", basicSalarySen: 668000, allowanceSen: 56000, overtimeRateSen: 4450, managerId: 9231 },
];

/** The HR administrator: an account, not a personnel record, as in a real company. */
export const presentationAdmin = {
  id: PRESENTATION_ID_MIN,
  email: "hr.admin@meridian-demo.invalid",
};

/** The manager and the employee the walkthrough signs in as. */
export const presentationManagerAccount = { id: 9203, email: "nur.hidayah@meridian-demo.invalid" };
export const presentationEmployeeAccount = { id: 9205, email: "kar.wai@meridian-demo.invalid" };
export const presentationEmployeeAccounts = [presentationManagerAccount, presentationEmployeeAccount];

/**
 * Kuala Lumpur's 2026 public holidays, including the substitute days that
 * follow a holiday falling on a weekend.
 *
 * Source: publicholidays.com.my Kuala Lumpur 2026, cross-checked against
 * malaysiapublicholiday.my (Kuala Lumpur, 2026). Both were read on
 * 16 September 2026 and agree on every gazetted date; the substitute days come
 * from the first. Nothing here is invented, and no new holiday engine exists:
 * these are rows in the product's existing company calendar.
 *
 * `company_holidays` holds one row per date, so 1 February - Thaipusam and
 * Federal Territory Day on the same Sunday - is one row naming both.
 */
export const presentationHolidays: Array<{ date: string; name: string }> = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-01", name: "Thaipusam / Federal Territory Day" },
  { date: "2026-02-02", name: "Thaipusam (substitute)" },
  { date: "2026-02-03", name: "Federal Territory Day (substitute)" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-02-18", name: "Chinese New Year (second day)" },
  { date: "2026-03-07", name: "Nuzul Al-Quran" },
  { date: "2026-03-20", name: "Hari Raya Aidilfitri (additional day)" },
  { date: "2026-03-21", name: "Hari Raya Aidilfitri" },
  { date: "2026-03-22", name: "Hari Raya Aidilfitri (second day)" },
  { date: "2026-03-23", name: "Hari Raya Aidilfitri (substitute)" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-27", name: "Hari Raya Haji" },
  { date: "2026-05-31", name: "Wesak Day" },
  { date: "2026-06-01", name: "Birthday of the Yang di-Pertuan Agong" },
  { date: "2026-06-02", name: "Wesak Day (substitute)" },
  { date: "2026-06-17", name: "Awal Muharram" },
  { date: "2026-08-25", name: "Birthday of Prophet Muhammad" },
  { date: "2026-08-31", name: "National Day" },
  { date: "2026-09-16", name: "Malaysia Day" },
  { date: "2026-11-08", name: "Deepavali" },
  { date: "2026-11-09", name: "Deepavali (substitute)" },
  { date: "2026-12-25", name: "Christmas Day" },
];

/** What some colleagues chose to say about themselves. */
export const presentationProfiles: Array<{ employeeId: number; about: string; skills: string[]; sharePhone: boolean }> = [
  { employeeId: 9203, about: "I lead the platform team. I care about shipping small, safe changes and about the people who ship them. Ask me about architecture, on-call or how to get something unblocked.", skills: ["Engineering management", "Distributed systems", "TypeScript", "Coaching"], sharePhone: true },
  { employeeId: 9205, about: "Software engineer on the platform team. Currently working on the billing service and the reporting pipeline.", skills: ["TypeScript", "PostgreSQL", "Node.js", "Testing"], sharePhone: false },
  { employeeId: 9218, about: "I look after hiring, onboarding and the policies that decide how we work day to day. If something about working here does not make sense, tell me.", skills: ["Employee relations", "Policy design", "Hiring", "Compensation"], sharePhone: true },
  { employeeId: 9202, about: "Head of Engineering. I spend most of my time on delivery, hiring and making sure the two teams are pulling in the same direction.", skills: ["Engineering leadership", "System design", "Hiring"], sharePhone: true },
  { employeeId: 9213, about: "Product and design. I am interested in the research behind a decision as much as the decision itself.", skills: ["Product strategy", "Design leadership", "User research"], sharePhone: false },
  { employeeId: 9204, about: "Senior engineer. Mostly platform work, and the person to ask about our deployment pipeline.", skills: ["Go", "Kubernetes", "Observability", "Mentoring"], sharePhone: false },
  { employeeId: 9226, about: "Sales and partnerships across Malaysia and Singapore.", skills: ["Enterprise sales", "Partnerships", "Negotiation"], sharePhone: true },
  { employeeId: 9231, about: "Operations and customer success. I care about response times and about the customers behind them.", skills: ["Service delivery", "Customer success", "Process design"], sharePhone: true },
  { employeeId: 9208, about: "Junior engineer, three months in. Learning the codebase and pairing as much as I can.", skills: ["TypeScript", "React"], sharePhone: false },
];

/** A little company-visible history, so a profile is not blank. */
export const presentationTimeline: Array<{ employeeId: number; kind: "job_title_changed" | "department_changed" | "manager_changed"; occurredOn: string; title: string }> = [
  { employeeId: 9203, kind: "job_title_changed", occurredOn: "2023-01-01", title: "Promoted to Engineering Manager, Platform" },
  { employeeId: 9204, kind: "job_title_changed", occurredOn: "2023-07-01", title: "Promoted to Senior Software Engineer" },
  { employeeId: 9210, kind: "job_title_changed", occurredOn: "2024-01-01", title: "Promoted to Senior Software Engineer" },
  { employeeId: 9215, kind: "job_title_changed", occurredOn: "2024-04-01", title: "Promoted to Senior Product Designer" },
  { employeeId: 9219, kind: "manager_changed", occurredOn: "2024-09-01", title: "Now reports to Farah Izzati binti Hassan" },
  { employeeId: 9232, kind: "job_title_changed", occurredOn: "2023-03-01", title: "Promoted to Customer Success Manager" },
  { employeeId: 9227, kind: "job_title_changed", occurredOn: "2023-10-01", title: "Promoted to Senior Account Manager" },
];

/**
 * Dates that a viewer reads as "now" are derived from the company's own today
 * through this calendar, which the loader supplies because it knows the
 * holiday list. Nothing below hard-codes a fake today.
 */
export interface PresentationCalendar {
  today: string;
  addDays: (date: string, days: number) => string;
  /** The date `days` working days after `date`, skipping weekends and holidays. */
  addWorkingDays: (date: string, days: number) => string;
}

export interface PresentationLeave {
  employee: number;
  type: "annual" | "medical" | "emergency" | "unpaid";
  start: string;
  end: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
}

/**
 * Leave as a company actually holds it: history behind, decisions waiting, and
 * approved time off ahead. Two people are away on the day of the walkthrough,
 * so Who's Out and the attendance figures have something true to show, and the
 * requests waiting for a decision sit in the platform manager's queue.
 */
export function presentationLeave(cal: PresentationCalendar): PresentationLeave[] {
  const { today, addDays, addWorkingDays } = cal;
  return [
    // Away today.
    { employee: 9217, type: "annual", start: addWorkingDays(today, -1), end: addWorkingDays(today, 1), status: "approved", reason: "Family trip to Penang" },
    { employee: 9228, type: "annual", start: today, end: addWorkingDays(today, 2), status: "approved", reason: "Annual leave" },
    { employee: 9224, type: "medical", start: today, end: today, status: "approved", reason: "Medical appointment" },

    // Approved and still ahead.
    { employee: 9206, type: "annual", start: addWorkingDays(today, 7), end: addWorkingDays(today, 11), status: "approved", reason: "Wedding in Ipoh" },
    { employee: 9212, type: "annual", start: addWorkingDays(today, 4), end: addWorkingDays(today, 5), status: "approved", reason: "Long weekend" },
    { employee: 9232, type: "annual", start: addWorkingDays(today, 15), end: addWorkingDays(today, 19), status: "approved", reason: "Annual leave" },

    // Waiting for the platform manager: one of them is the employee account's.
    { employee: 9205, type: "annual", start: addWorkingDays(today, 14), end: addWorkingDays(today, 18), status: "pending", reason: "Planned time off" },
    { employee: 9207, type: "emergency", start: addWorkingDays(today, 2), end: addWorkingDays(today, 2), status: "pending", reason: "Family matter" },

    // Waiting for HR, from other teams.
    { employee: 9211, type: "annual", start: addWorkingDays(today, 21), end: addWorkingDays(today, 22), status: "pending", reason: "Short break" },
    { employee: 9233, type: "medical", start: addWorkingDays(today, 1), end: addWorkingDays(today, 1), status: "pending", reason: "Specialist appointment" },
    { employee: 9216, type: "unpaid", start: addWorkingDays(today, 25), end: addWorkingDays(today, 26), status: "pending", reason: "Personal matter" },

    // History.
    { employee: 9204, type: "annual", start: addDays(today, -47), end: addDays(today, -43), status: "approved", reason: "Annual leave" },
    { employee: 9219, type: "medical", start: addDays(today, -38), end: addDays(today, -37), status: "approved", reason: "Medical leave" },
    { employee: 9227, type: "annual", start: addDays(today, -31), end: addDays(today, -28), status: "approved", reason: "School holidays" },
    { employee: 9214, type: "annual", start: addDays(today, -24), end: addDays(today, -24), status: "approved", reason: "Personal errand" },
    { employee: 9210, type: "medical", start: addDays(today, -17), end: addDays(today, -17), status: "approved", reason: "Medical leave" },
    { employee: 9223, type: "emergency", start: addDays(today, -10), end: addDays(today, -10), status: "approved", reason: "Family emergency" },
    { employee: 9230, type: "annual", start: addDays(today, -12), end: addDays(today, -9), status: "rejected", reason: "Annual leave" },
    { employee: 9229, type: "annual", start: addWorkingDays(today, 9), end: addWorkingDays(today, 10), status: "cancelled", reason: "Plans changed" },
    // The employee account has a little history of its own to show.
    { employee: 9205, type: "annual", start: addDays(today, -66), end: addDays(today, -62), status: "approved", reason: "Annual leave" },
    { employee: 9205, type: "medical", start: addDays(today, -29), end: addDays(today, -29), status: "approved", reason: "Medical leave" },
    { employee: 9205, type: "annual", start: addDays(today, -20), end: addDays(today, -19), status: "cancelled", reason: "Plans changed" },
  ];
}

export function presentationEvents(cal: PresentationCalendar): Array<{
  title: string; description?: string; location?: string; startsOn: string; endsOn?: string; startTime?: string; endTime?: string;
}> {
  const { today, addDays, addWorkingDays } = cal;
  return [
    { title: "Platform demo day", description: "The platform team shows what shipped this fortnight. Everyone welcome.", location: "Level 18, Auditorium", startsOn: addWorkingDays(today, 2), startTime: "16:00", endTime: "17:00" },
    { title: "New joiner coffee session", description: "An informal half hour for everyone who joined in the last two months.", location: "Level 17, Pantry", startsOn: addWorkingDays(today, 4), startTime: "09:30", endTime: "10:15" },
    { title: "Company town hall", description: "Quarterly update from the managing director, followed by questions.", location: "Level 18, Auditorium", startsOn: addWorkingDays(today, 8), startTime: "10:00", endTime: "11:30" },
    { title: "Client workshop: Astra Retail", description: "Discovery workshop with the client team.", location: "Client office, Bangsar South", startsOn: addWorkingDays(today, 12), startTime: "09:30", endTime: "16:30" },
    { title: "Engineering offsite", description: "Two days of planning for the next quarter.", location: "Port Dickson", startsOn: addDays(today, -21), endsOn: addDays(today, -20) },
    { title: "Deepavali celebration", description: "Lunch and an open house at the office.", location: "Level 17, Common area", startsOn: "2026-11-06", startTime: "12:00", endTime: "14:00" },
  ];
}

export function presentationAnnouncements(cal: PresentationCalendar): Array<{
  key: string; title: string; body: string; priority: "normal" | "important"; status: "published" | "draft";
  department?: string; publishedOn?: string; expiresOn?: string;
}> {
  const { today, addDays } = cal;
  return [
    {
      key: "welcome-anisha", title: "Welcome Anisha Kaur to People & Culture", priority: "normal", status: "published",
      publishedOn: addDays(today, -44),
      body: "Anisha joined us on 3 August as People Operations Assistant, working with Melissa on onboarding and employee records. She sits on Level 17 - do say hello.",
    },
    {
      key: "hiring-platform", title: "We are hiring: Platform Engineering and Customer Success", priority: "normal", status: "published",
      publishedOn: addDays(today, -18),
      body: "Two roles are open: a mid-level platform engineer and a customer success executive. The referral bonus applies to both. Ridzuan has the briefs, and referrals go through the People & Culture team.",
    },
    {
      key: "malaysia-day", title: "Office closed for Malaysia Day", priority: "normal", status: "published",
      publishedOn: addDays(today, -6), expiresOn: addDays(today, 7),
      body: "The office is closed on Wednesday 16 September for Malaysia Day. On-call cover is unchanged, and anyone working the client escalation should agree a replacement day with their manager.",
    },
    {
      key: "review-cycle", title: "Mid-year reviews: self-reviews close this week", priority: "important", status: "published",
      publishedOn: addDays(today, -3),
      body: "Self-reviews for the Mid-year 2026 cycle are due this Friday, and managers have the following week to write theirs. The form is under Growth, and Farah's team can help if anything is unclear.",
    },
    {
      key: "town-hall-agenda", title: "Q4 town hall: agenda and questions", priority: "normal", status: "draft",
      body: "Draft agenda for the quarterly town hall: results, the platform roadmap, hiring, and an open question session. Send questions ahead of time so we can group them.",
    },
  ];
}

export const presentationLifecycleTemplates: Array<{
  key: string; kind: "onboarding" | "offboarding"; name: string; description: string;
  tasks: Array<{ title: string; instructions?: string; role: "employee" | "manager" | "hr"; offset: number }>;
}> = [
  {
    key: "onboarding", kind: "onboarding", name: "New joiner onboarding", description: "Everything a new colleague needs in their first month at Meridian Digital.",
    tasks: [
      { title: "Prepare laptop and accounts", instructions: "Raise the IT request at least three working days before the start date.", role: "hr", offset: -3 },
      { title: "Send the welcome pack", instructions: "Company handbook, benefits summary and the first-week schedule.", role: "hr", offset: -1 },
      { title: "First-day welcome and office tour", role: "manager", offset: 0 },
      { title: "Set up payroll and statutory details", instructions: "Bank details, EPF and tax file number, collected through the People & Culture team.", role: "hr", offset: 1 },
      { title: "Meet the team and agree the first project", role: "manager", offset: 3 },
      { title: "Complete security and data-protection training", role: "employee", offset: 7 },
      { title: "Set first-quarter goals with your manager", role: "employee", offset: 14 },
      { title: "Thirty-day check-in", instructions: "Half an hour on how the first month went, what is unclear and what to change.", role: "manager", offset: 30 },
    ],
  },
  {
    key: "offboarding", kind: "offboarding", name: "Leaver offboarding", description: "Closing out an employment properly, in the right order.",
    tasks: [
      { title: "Acknowledge the resignation in writing", role: "hr", offset: -21 },
      { title: "Agree the handover plan", instructions: "Name the person taking each responsibility, and the date it moves.", role: "manager", offset: -14 },
      { title: "Complete the handover notes", role: "employee", offset: -5 },
      { title: "Return laptop, access card and equipment", role: "employee", offset: 0 },
      { title: "Revoke system access", instructions: "On the last working day, after the handover is confirmed.", role: "hr", offset: 0 },
      { title: "Final pay and exit interview", role: "hr", offset: 3 },
    ],
  },
];

/**
 * Two people still settling in and one leaving at the end of the month. The
 * completed tasks are the ones that would genuinely be done by now, so the
 * remaining ones are what HR and the manager actually have to do.
 */
export function presentationLifecyclePlans(cal: PresentationCalendar): Array<{
  employeeId: number; template: string; startsOn: string; targetDate: string; done: number[]; exitStatus?: "resigned" | "terminated" | "inactive";
}> {
  const { today, addDays, addWorkingDays } = cal;
  return [
    // Haziq joined on 6 July: nearly through, with the thirty-day check-in and
    // the goal-setting task still open.
    { employeeId: 9208, template: "onboarding", startsOn: "2026-07-06", targetDate: "2026-08-05", done: [1, 2, 3, 4, 5, 6] },
    // Anisha joined on 3 August: the later tasks are still ahead of her.
    { employeeId: 9221, template: "onboarding", startsOn: "2026-08-03", targetDate: "2026-09-02", done: [1, 2, 3, 4, 5] },
    // Kah Meng resigned; his last working day is the end of this month.
    { employeeId: 9234, template: "offboarding", startsOn: addDays(today, -18), targetDate: addWorkingDays(today, 10), done: [1, 2], exitStatus: "resigned" },
  ];
}

export function presentationRecognitions(cal: PresentationCalendar): Array<{
  giver: number; receiver: number; category: "teamwork" | "above_and_beyond" | "customer_focus" | "problem_solving" | "mentoring";
  message: string; visibility: "company" | "private"; givenOn: string;
}> {
  const { today, addDays } = cal;
  return [
    { giver: 9203, receiver: 9204, category: "mentoring", message: "Thank you for pairing with Haziq every afternoon in his first fortnight. He is contributing already, and that is largely your doing.", visibility: "company", givenOn: addDays(today, -39) },
    { giver: 9209, receiver: 9212, category: "problem_solving", message: "You found the cause of the Friday night deployment failure in under an hour and wrote it up so it cannot happen again.", visibility: "company", givenOn: addDays(today, -33) },
    { giver: 9231, receiver: 9233, category: "customer_focus", message: "Astra Retail said your handling of their migration weekend was the best support they have had from any vendor.", visibility: "company", givenOn: addDays(today, -26) },
    { giver: 9218, receiver: 9219, category: "above_and_beyond", message: "You covered both onboarding cohorts while we were short-handed and neither joiner noticed a thing.", visibility: "company", givenOn: addDays(today, -21) },
    { giver: 9205, receiver: 9207, category: "teamwork", message: "Thanks for staying late to finish the regression run before the release. It made the whole thing calm instead of frantic.", visibility: "company", givenOn: addDays(today, -14) },
    { giver: 9213, receiver: 9217, category: "above_and_beyond", message: "The research summary changed the roadmap. It is rare that six interviews are that useful.", visibility: "company", givenOn: addDays(today, -11) },
    { giver: 9222, receiver: 9223, category: "above_and_beyond", message: "August payroll closed a day early and with no corrections. Thank you.", visibility: "company", givenOn: addDays(today, -8) },
    { giver: 9204, receiver: 9205, category: "problem_solving", message: "The billing reconciliation fix was neat, and the tests you added around it are better than the code they cover.", visibility: "company", givenOn: addDays(today, -4) },
    { giver: 9203, receiver: 9206, category: "teamwork", message: "You picked up the on-call handover at short notice and kept everyone informed. Quietly done and much appreciated.", visibility: "private", givenOn: addDays(today, -2) },
  ];
}

export function presentationGoals(cal: PresentationCalendar): Array<{
  owner: number; setBy: number; title: string; description: string; startsOn: string; dueOn: string;
  status: "active" | "completed"; progress: number; visibility: "private" | "team" | "company"; completedOn?: string;
  updates: Array<{ by: number; on: string; from: number; to: number; note?: string; status?: "active" | "completed" }>;
}> {
  const { today, addDays } = cal;
  return [
    {
      owner: 9205, setBy: 9203, title: "Cut billing service p95 latency to under 400 ms", description: "The billing service is the slowest path in the product. Profile it, fix the two worst queries and keep the improvement under load.",
      startsOn: addDays(today, -74), dueOn: addDays(today, 16), status: "active", progress: 65, visibility: "team",
      updates: [
        { by: 9205, on: addDays(today, -45), from: 0, to: 30, note: "Profiling done. Two N+1 queries in the invoice summary are most of it." },
        { by: 9205, on: addDays(today, -12), from: 30, to: 65, note: "First query fixed and deployed; p95 is down to 620 ms." },
      ],
    },
    {
      owner: 9205, setBy: 9205, title: "Finish the platform on-call handbook", description: "Write down what the platform team actually does on call, so the next joiner does not have to ask.",
      startsOn: addDays(today, -60), dueOn: addDays(today, -5), status: "active", progress: 70, visibility: "team",
      updates: [{ by: 9205, on: addDays(today, -20), from: 40, to: 70, note: "Escalation paths and the runbook index are written. The alert catalogue is left." }],
    },
    {
      owner: 9204, setBy: 9203, title: "Move deployments to the new pipeline", description: "Every service deploys through the new pipeline, with a rollback that has been tested rather than assumed.",
      startsOn: addDays(today, -88), dueOn: addDays(today, 30), status: "active", progress: 55, visibility: "team",
      updates: [{ by: 9204, on: addDays(today, -26), from: 25, to: 55, note: "Six of eleven services moved. Rollback rehearsed twice." }],
    },
    {
      owner: 9207, setBy: 9203, title: "Automate the release regression suite", description: "The release checklist takes a day by hand. Automate the parts that are the same every time.",
      startsOn: addDays(today, -52), dueOn: addDays(today, 24), status: "active", progress: 40, visibility: "team",
      updates: [{ by: 9207, on: addDays(today, -9), from: 15, to: 40, note: "Smoke suite runs on every build now." }],
    },
    {
      owner: 9206, setBy: 9206, title: "Take over the reporting service", description: "Become the person who can safely change the reporting service without help.",
      startsOn: addDays(today, -40), dueOn: addDays(today, 50), status: "active", progress: 25, visibility: "team",
      updates: [],
    },
    {
      owner: 9203, setBy: 9202, title: "Halve the platform on-call load", description: "Nobody should be woken twice in a week. Cut the alerts that do not need a person, and share the rota more widely.",
      startsOn: addDays(today, -84), dueOn: addDays(today, 36), status: "active", progress: 60, visibility: "team",
      updates: [
        { by: 9203, on: addDays(today, -40), from: 20, to: 45, note: "Nine alerts retired, four rewritten to page only on customer impact." },
        { by: 9203, on: addDays(today, -6), from: 45, to: 60, note: "Two nights paged last month, against nine in May." },
      ],
    },
    {
      owner: 9203, setBy: 9203, title: "Grow two engineers into senior scope", description: "Give Kar Wai and Siti Balqis work with real ownership, and the support to carry it.",
      startsOn: addDays(today, -95), dueOn: addDays(today, 70), status: "active", progress: 35, visibility: "team",
      updates: [{ by: 9203, on: addDays(today, -16), from: 15, to: 35, note: "Both now lead their own workstream; reviewing progress at the mid-year cycle." }],
    },
    {
      owner: 9217, setBy: 9213, title: "Run six discovery interviews for the analytics work", description: "Understand how customers actually read the reports before we redesign them.",
      startsOn: addDays(today, -62), dueOn: addDays(today, -12), status: "completed", progress: 100, visibility: "company", completedOn: addDays(today, -13),
      updates: [
        { by: 9217, on: addDays(today, -30), from: 30, to: 80, note: "Five interviews done, one rescheduled." },
        { by: 9217, on: addDays(today, -13), from: 80, to: 100, note: "Summary shared with product and engineering.", status: "completed" },
      ],
    },
    {
      owner: 9233, setBy: 9232, title: "First response under two hours for priority tickets", description: "Hold first response under two hours for priority-one tickets through the quarter.",
      startsOn: addDays(today, -80), dueOn: addDays(today, 12), status: "active", progress: 80, visibility: "team",
      updates: [{ by: 9233, on: addDays(today, -7), from: 60, to: 80, note: "Averaging 84 minutes this month." }],
    },
    {
      owner: 9228, setBy: 9226, title: "Close two enterprise accounts this quarter", description: "Two signed enterprise agreements, with the onboarding date agreed at signature.",
      startsOn: addDays(today, -78), dueOn: addDays(today, 14), status: "active", progress: 50, visibility: "team",
      updates: [{ by: 9228, on: addDays(today, -15), from: 20, to: 50, note: "One signed, one at legal review." }],
    },
    {
      owner: 9219, setBy: 9218, title: "Cut time-to-offer to under three weeks", description: "From first interview to written offer, for every open engineering role.",
      startsOn: addDays(today, -70), dueOn: addDays(today, 40), status: "active", progress: 45, visibility: "team",
      updates: [{ by: 9219, on: addDays(today, -18), from: 20, to: 45, note: "Interview loop shortened from five stages to three." }],
    },
  ];
}

/**
 * One closed cycle for history and one open cycle that is the reason the
 * "Reviews to write" widget has anything in it: the platform manager has two
 * self-reviews waiting for her and one review she has already written.
 */
export function presentationReviewCycles(cal: PresentationCalendar): Array<{
  key: string; name: string; periodStart: string; periodEnd: string; selfDueOn: string; managerDueOn: string;
  status: "open" | "closed"; openedOn: string; closedOn?: string; departments: string[];
  reviews: Array<{ employee: number; self?: [number, string, string]; manager?: [number, string, string, number]; response?: [string, string] }>;
}> {
  const { today, addDays, addWorkingDays } = cal;
  return [
    {
      key: "annual-2025", name: "Annual 2025", periodStart: "2025-01-01", periodEnd: "2025-12-31",
      selfDueOn: "2026-01-16", managerDueOn: "2026-01-30", status: "closed", openedOn: "2026-01-05", closedOn: "2026-02-06", departments: [],
      reviews: [
        {
          employee: 9205,
          self: [3, "Shipped the invoicing rewrite and picked up the reporting service when Arvind was away.", "2026-01-13"],
          manager: [4, "Kar Wai took on work outside his comfort zone twice this year and both landed well. Next year: more design input earlier.", "2026-01-27", 9203],
          response: ["Thank you. I would like to take the lead on the reporting work next.", "2026-01-28"],
        },
        {
          employee: 9204,
          self: [4, "Led the pipeline migration and mentored two engineers through it.", "2026-01-12"],
          manager: [4, "Arvind is the reason the migration was uneventful. The mentoring is what I value most.", "2026-01-26", 9203],
        },
      ],
    },
    {
      key: "midyear-2026", name: "Mid-year 2026", periodStart: "2026-01-01", periodEnd: "2026-06-30",
      selfDueOn: addWorkingDays(today, 3), managerDueOn: addWorkingDays(today, 10),
      status: "open", openedOn: addDays(today, -10), departments: ["Engineering", "Product & Design"],
      reviews: [
        // Written already, so the cycle shows progress rather than an empty list.
        {
          employee: 9204,
          self: [4, "Pipeline work is on track and I have kept the on-call load off the rest of the team.", addDays(today, -7)],
          manager: [4, "Arvind carries more than his share quietly. We agreed he will hand over half of on-call this quarter.", addDays(today, -5), 9203],
        },
        // Waiting for the manager: this is what her widget counts.
        { employee: 9205, self: [4, "Billing latency is down by a third and the on-call handbook is nearly finished.", addDays(today, -4)] },
        { employee: 9207, self: [3, "Automated the smoke suite; the full regression is still manual.", addDays(today, -2)] },
      ],
    },
  ];
}

/**
 * A tiny deterministic generator (mulberry32).
 *
 * Attendance needs variation to look real, but a rebuilt presentation must be
 * identical for a given day, so Math.random is not an option.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A few people have filled in more of their record, as they would have over
 * time. Deliberately not everyone, and never every field: a directory where
 * every row is complete does not look like a real one.
 */
export const presentationDetails: Array<{
  employeeId: number; address?: string; dateOfBirth?: string; emergencyContactName?: string; emergencyContactPhone?: string;
}> = [
  { employeeId: 9203, address: "12-3A, Residensi Suasana, Jalan Tun Razak, 50400 Kuala Lumpur", dateOfBirth: "1989-04-17", emergencyContactName: "Roslan bin Ahmad", emergencyContactPhone: "+60 3-5550 0103" },
  { employeeId: 9205, address: "8-12, Vista Damansara, Jalan Damansara, 60000 Kuala Lumpur", dateOfBirth: "1995-11-02", emergencyContactName: "Chong Mei Fong", emergencyContactPhone: "+60 3-5550 0105" },
  { employeeId: 9202, address: "27, Jalan Setiabakti, Bukit Damansara, 50490 Kuala Lumpur", dateOfBirth: "1984-02-28" },
  { employeeId: 9218, address: "5-8, The Sentral Residences, Jalan Stesen Sentral, 50470 Kuala Lumpur", dateOfBirth: "1986-07-09", emergencyContactName: "Hassan bin Idris", emergencyContactPhone: "+60 3-5550 0118" },
  { employeeId: 9208, address: "Unit 14-2, PV21 Residence, Setapak, 53300 Kuala Lumpur", dateOfBirth: "2002-01-26", emergencyContactName: "Kamarul bin Yusof", emergencyContactPhone: "+60 3-5550 0108" },
  { employeeId: 9221, dateOfBirth: "2003-05-14", emergencyContactName: "Harjit Singh", emergencyContactPhone: "+60 3-5550 0121" },
  { employeeId: 9226, address: "19, Jalan Kiara 3, Mont Kiara, 50480 Kuala Lumpur", dateOfBirth: "1983-09-30" },
  { employeeId: 9231, address: "3-11, Kiaraville, Mont Kiara, 50480 Kuala Lumpur", emergencyContactName: "Suresh Menon", emergencyContactPhone: "+60 3-5550 0131" },
  { employeeId: 9234, dateOfBirth: "1993-12-05" },
  { employeeId: 9213, address: "22-6, Ken Bangsar, Jalan Maarof, 59100 Kuala Lumpur", dateOfBirth: "1987-03-19" },
];
