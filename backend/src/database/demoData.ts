/**
 * The demo dataset: a fictional company, defined once and identically every run.
 *
 * Everything here is invented. Addresses use the `.invalid` top-level domain,
 * which RFC 2606 reserves precisely so it can never resolve to a real mailbox,
 * and no name, number or identifier belongs to a real person.
 *
 * The dataset is a plain description, separate from the loader that writes it,
 * so what the demo contains can be reviewed without reading transaction code.
 */

/** Reserved identifier range. Nothing outside it is ever touched by the loader. */
export const DEMO_ID_MIN = 9000;
export const DEMO_ID_MAX = 9099;

/** The demo payroll month. Deliberately NOT September 2026: the source database
 *  holds a September draft period that must survive, and payroll periods are
 *  unique per month, so a different month cannot collide with it. */
export const DEMO_PAYROLL_YEAR = 2026;
export const DEMO_PAYROLL_MONTH = 8;

/** Anchors the attendance and leave history so every run produces the same dates. */
export const DEMO_TODAY = "2026-09-09";

export interface DemoDepartment {
  name: string;
  description: string;
}

export const demoDepartments: DemoDepartment[] = [
  { name: "Human Resources", description: "People operations, hiring and employee relations" },
  { name: "Engineering", description: "Product engineering and platform" },
  { name: "Finance", description: "Accounting, payroll operations and reporting" },
  { name: "Marketing", description: "Brand, content and campaigns" },
  { name: "Operations", description: "Facilities, procurement and internal services" },
  { name: "Sales", description: "Client acquisition and account management" },
  { name: "Leadership", description: "Company direction and the heads of department" },
];

export interface DemoEmployee {
  id: number;
  employeeNumber: string;
  fullName: string;
  department: string;
  jobTitle: string;
  status: "active" | "probation" | "inactive" | "resigned";
  employmentDate: string;
  /** Sen. Omitted for employees who should have no compensation record. */
  basicSalarySen?: number;
  allowanceSen?: number;
  overtimeRateSen?: number;
  /** Employees with a sign-in; the rest are personnel records without logins. */
  account?: "admin" | "employee";
  /** Direct manager's demo id. Applied after every employee exists. */
  managerId?: number;
}

/**
 * Twenty-four fictional employees across six departments, with a realistic mix
 * of statuses: most active, a few on probation, one inactive and one resigned,
 * so the workforce report has something to show beyond a single bar.
 */
export const demoEmployees: DemoEmployee[] = [
  { id: 9001, employeeNumber: "HRX-001", fullName: "Nurul Aisyah binti Kamal", department: "Human Resources", jobTitle: "Head of People", status: "active", employmentDate: "2021-02-01", basicSalarySen: 1150000, allowanceSen: 120000, overtimeRateSen: 0, account: "employee", managerId: 9025 },
  { id: 9002, employeeNumber: "HRX-002", fullName: "Farah Hanim binti Osman", department: "Human Resources", jobTitle: "HR Executive", status: "active", employmentDate: "2023-06-12", basicSalarySen: 480000, allowanceSen: 40000, overtimeRateSen: 3200, managerId: 9001 },
  { id: 9003, employeeNumber: "HRX-003", fullName: "Danial Haziq bin Rosli", department: "Human Resources", jobTitle: "Recruitment Coordinator", status: "probation", employmentDate: "2026-07-01", basicSalarySen: 380000, allowanceSen: 25000, overtimeRateSen: 2600, managerId: 9001 },

  { id: 9004, employeeNumber: "ENG-001", fullName: "Wei Jian Tan", department: "Engineering", jobTitle: "Engineering Manager", status: "active", employmentDate: "2020-09-14", basicSalarySen: 1400000, allowanceSen: 150000, overtimeRateSen: 0, account: "employee", managerId: 9025 },
  { id: 9005, employeeNumber: "ENG-002", fullName: "Priya Devi Ramasamy", department: "Engineering", jobTitle: "Senior Software Engineer", status: "active", employmentDate: "2022-03-07", basicSalarySen: 980000, allowanceSen: 90000, overtimeRateSen: 6500, managerId: 9004 },
  { id: 9006, employeeNumber: "ENG-003", fullName: "Aiman Zulkifli bin Harun", department: "Engineering", jobTitle: "Software Engineer", status: "active", employmentDate: "2023-01-16", basicSalarySen: 720000, allowanceSen: 60000, overtimeRateSen: 4800, account: "employee", managerId: 9004 },
  { id: 9007, employeeNumber: "ENG-004", fullName: "Chloe Mei Ling Wong", department: "Engineering", jobTitle: "Software Engineer", status: "active", employmentDate: "2023-08-21", basicSalarySen: 690000, allowanceSen: 60000, overtimeRateSen: 4600, managerId: 9004 },
  { id: 9008, employeeNumber: "ENG-005", fullName: "Rajesh Kumar Subramaniam", department: "Engineering", jobTitle: "QA Engineer", status: "active", employmentDate: "2024-02-05", basicSalarySen: 610000, allowanceSen: 50000, overtimeRateSen: 4100, managerId: 9004 },
  // Reports to the senior engineer, so the org chart has a third level.
  { id: 9009, employeeNumber: "ENG-006", fullName: "Syafiqah binti Ismail", department: "Engineering", jobTitle: "Junior Software Engineer", status: "probation", employmentDate: "2026-08-03", basicSalarySen: 420000, allowanceSen: 30000, overtimeRateSen: 2800, managerId: 9005 },

  { id: 9010, employeeNumber: "FIN-001", fullName: "Lim Cheng Hoe", department: "Finance", jobTitle: "Finance Manager", status: "active", employmentDate: "2019-11-04", basicSalarySen: 1250000, allowanceSen: 130000, overtimeRateSen: 0, managerId: 9025 },
  { id: 9011, employeeNumber: "FIN-002", fullName: "Nadia Farhana binti Zainal", department: "Finance", jobTitle: "Payroll Officer", status: "active", employmentDate: "2022-05-30", basicSalarySen: 560000, allowanceSen: 45000, overtimeRateSen: 3700, managerId: 9010 },
  { id: 9012, employeeNumber: "FIN-003", fullName: "Arun Pillai", department: "Finance", jobTitle: "Accounts Executive", status: "active", employmentDate: "2023-10-09", basicSalarySen: 490000, allowanceSen: 40000, overtimeRateSen: 3300, managerId: 9010 },

  { id: 9013, employeeNumber: "MKT-001", fullName: "Serena Yap Li Xuan", department: "Marketing", jobTitle: "Marketing Lead", status: "active", employmentDate: "2021-07-19", basicSalarySen: 950000, allowanceSen: 95000, overtimeRateSen: 0, managerId: 9025 },
  { id: 9014, employeeNumber: "MKT-002", fullName: "Hafiz Ridzuan bin Mokhtar", department: "Marketing", jobTitle: "Content Strategist", status: "active", employmentDate: "2023-04-03", basicSalarySen: 580000, allowanceSen: 45000, overtimeRateSen: 3800, managerId: 9013 },
  { id: 9015, employeeNumber: "MKT-003", fullName: "Elaine Chong Sook Yee", department: "Marketing", jobTitle: "Graphic Designer", status: "active", employmentDate: "2024-01-08", basicSalarySen: 520000, allowanceSen: 40000, overtimeRateSen: 3400, managerId: 9013 },
  // Inactive, and deliberately without a compensation record. Payroll V1 selects
  // every employee who has compensation in force, regardless of employment
  // status, so leaving one here would put an inactive employee on the demo
  // payslip list. Closing out their compensation is what a company would do
  // anyway, and it keeps the demo from showing behaviour we would rather change.
  { id: 9016, employeeNumber: "MKT-004", fullName: "Iskandar bin Mahmud", department: "Marketing", jobTitle: "Marketing Assistant", status: "inactive", employmentDate: "2022-09-12", managerId: 9013 },

  { id: 9017, employeeNumber: "OPS-001", fullName: "Kavitha Nair", department: "Operations", jobTitle: "Operations Manager", status: "active", employmentDate: "2020-06-22", basicSalarySen: 1100000, allowanceSen: 110000, overtimeRateSen: 0, managerId: 9025 },
  { id: 9018, employeeNumber: "OPS-002", fullName: "Zulhilmi bin Abdul Razak", department: "Operations", jobTitle: "Facilities Coordinator", status: "active", employmentDate: "2022-11-14", basicSalarySen: 470000, allowanceSen: 38000, overtimeRateSen: 3100, managerId: 9017 },
  { id: 9019, employeeNumber: "OPS-003", fullName: "Michelle Teoh Hui Ying", department: "Operations", jobTitle: "Procurement Executive", status: "active", employmentDate: "2023-03-27", basicSalarySen: 530000, allowanceSen: 42000, overtimeRateSen: 3500, managerId: 9017 },
  { id: 9020, employeeNumber: "OPS-004", fullName: "Suresh Maniam", department: "Operations", jobTitle: "Logistics Assistant", status: "active", employmentDate: "2024-05-13", basicSalarySen: 410000, allowanceSen: 30000, overtimeRateSen: 2750, managerId: 9017 },

  { id: 9021, employeeNumber: "SLS-001", fullName: "Adrian Goh Wei Sheng", department: "Sales", jobTitle: "Sales Director", status: "active", employmentDate: "2019-08-05", basicSalarySen: 1300000, allowanceSen: 160000, overtimeRateSen: 0, managerId: 9025 },
  { id: 9022, employeeNumber: "SLS-002", fullName: "Amirah binti Sulaiman", department: "Sales", jobTitle: "Account Manager", status: "active", employmentDate: "2022-01-24", basicSalarySen: 720000, allowanceSen: 80000, overtimeRateSen: 4800, managerId: 9021 },
  { id: 9023, employeeNumber: "SLS-003", fullName: "Bryan Lee Chun Kit", department: "Sales", jobTitle: "Sales Executive", status: "active", employmentDate: "2023-07-17", basicSalarySen: 560000, allowanceSen: 65000, overtimeRateSen: 3700, managerId: 9021 },
  // Resigned, so reports show a leaver and payroll correctly skips them.
  { id: 9024, employeeNumber: "SLS-004", fullName: "Vanessa Chin Mei Fong", department: "Sales", jobTitle: "Sales Executive", status: "resigned", employmentDate: "2021-04-12", managerId: 9021 },

  // The top of the reporting lines: every head of department reports here.
  { id: 9025, employeeNumber: "LDR-001", fullName: "Hazman bin Yusof", department: "Leadership", jobTitle: "Managing Director", status: "active", employmentDate: "2018-03-01", basicSalarySen: 2200000, allowanceSen: 250000, overtimeRateSen: 0 },
];

/** The administrator account. Not linked to an employee, like a real admin. */
export const demoAdmin = {
  id: DEMO_ID_MIN,
  email: "admin@nexus-demo.invalid",
};

/** The employee whose self-service view the demo walks through. */
export const demoEmployeeAccount = {
  id: 9001,
  email: "nurul.aisyah@nexus-demo.invalid",
};

/**
 * Every employee sign-in, one per role the demo shows: Nurul manages the HR
 * team, Wei Jian manages Engineering, and Aiman is an engineer with no reports.
 * The user id equals the employee id, inside the reserved range.
 */
export const demoEmployeeAccounts = [
  demoEmployeeAccount,
  { id: 9004, email: "wei.jian@nexus-demo.invalid" },
  { id: 9006, email: "aiman.zulkifli@nexus-demo.invalid" },
];

export function demoEmail(employee: DemoEmployee): string {
  const local = employee.employeeNumber.toLowerCase().replace(/[^a-z0-9]/g, ".");
  return `${local}@nexus-demo.invalid`;
}

/**
 * What some colleagues chose to say about themselves. Fictional, professional,
 * and only the three fields a profile holds: About, skills and whether the
 * work phone is shared.
 */
export const demoProfiles: Array<{ employeeId: number; about: string; skills: string[]; sharePhone: boolean }> = [
  { employeeId: 9001, about: "I look after the people side of the company: hiring, onboarding and making sure policies make sense in practice. Come to me with anything about how we work.", skills: ["Employee relations", "Recruitment", "Policy design", "Onboarding"], sharePhone: true },
  { employeeId: 9004, about: "I lead the engineering team that builds our internal platform. Happy to talk architecture, hiring or how to get a change shipped safely.", skills: ["Engineering management", "System design", "TypeScript", "Hiring"], sharePhone: true },
  { employeeId: 9005, about: "Senior engineer on the payments and payroll services. I mentor our newer engineers.", skills: ["PostgreSQL", "Node.js", "Payroll systems", "Mentoring"], sharePhone: false },
  { employeeId: 9006, about: "Software engineer. I mostly work on the web app and like making slow pages fast.", skills: ["React", "Accessibility", "Performance"], sharePhone: false },
  { employeeId: 9008, about: "I keep our releases honest. Ask me about test plans.", skills: ["Test automation", "Release checks"], sharePhone: false },
  { employeeId: 9010, about: "Finance manager: month-end close, budgets and payroll sign-off.", skills: ["Financial reporting", "Budgeting", "Payroll review"], sharePhone: true },
  { employeeId: 9011, about: "I run payroll each month. If a payslip looks wrong, I am the person to ask.", skills: ["Payroll", "Excel", "Reconciliation"], sharePhone: false },
  { employeeId: 9013, about: "Marketing lead. Brand, campaigns and the company newsletter.", skills: ["Brand strategy", "Copywriting", "Campaigns"], sharePhone: false },
  { employeeId: 9015, about: "Graphic designer. I make slides, posters and anything that needs to look good.", skills: ["Illustration", "Figma", "Presentation design"], sharePhone: false },
  { employeeId: 9017, about: "Operations manager: facilities, procurement and keeping the office running.", skills: ["Vendor management", "Facilities", "Procurement"], sharePhone: true },
  { employeeId: 9021, about: "Sales director. I work with our largest clients and coach the sales team.", skills: ["Account management", "Negotiation", "Forecasting"], sharePhone: true },
  { employeeId: 9025, about: "Managing Director. My door is open - book time with me any week.", skills: ["Strategy", "Leadership"], sharePhone: false },
];

/**
 * A little history, so profile timelines are not empty in the demo. Company-
 * visible role changes only; nothing private is invented.
 */
export const demoTimeline: Array<{ employeeId: number; kind: "job_title_changed" | "department_changed" | "manager_changed"; occurredOn: string; title: string }> = [
  { employeeId: 9005, kind: "job_title_changed", occurredOn: "2025-01-06", title: "New role: Senior Software Engineer" },
  { employeeId: 9004, kind: "job_title_changed", occurredOn: "2023-03-01", title: "New role: Engineering Manager" },
  { employeeId: 9011, kind: "department_changed", occurredOn: "2023-07-03", title: "Moved to Finance" },
  { employeeId: 9009, kind: "manager_changed", occurredOn: "2026-08-17", title: "Now reports to Priya Devi Ramasamy" },
  { employeeId: 9022, kind: "job_title_changed", occurredOn: "2024-04-01", title: "New role: Account Manager" },
];

/**
 * Company holidays for the demo calendar. Fixed-date observances only, so no
 * date here depends on a lunar or state-specific calendar that might be wrong.
 */
export const demoHolidays: Array<{ date: string; name: string }> = [
  { date: "2026-08-31", name: "National Day" },
  { date: "2026-09-16", name: "Malaysia Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2027-01-01", name: "New Year's Day" },
];

/** Company events: occasions everyone can see on the calendar. */
export const demoEvents: Array<{
  title: string; startsOn: string; endsOn?: string; startTime?: string; endTime?: string;
  location?: string; description?: string;
}> = [
  { title: "Quarterly town hall", startsOn: "2026-09-24", startTime: "15:00", endTime: "16:00", location: "Level 3, Nexus Hall", description: "Company results for the quarter and questions for the leadership team." },
  { title: "Engineering demo day", startsOn: "2026-10-02", startTime: "14:00", endTime: "17:00", location: "Engineering floor", description: "Teams show what they shipped this quarter. Everyone is welcome." },
  { title: "Family day", startsOn: "2026-10-17", location: "Taman Tasik (fictional venue)", description: "A day out for staff and their families." },
  { title: "Office move: packing week", startsOn: "2026-11-02", endsOn: "2026-11-06", description: "Label your boxes by Friday; facilities will collect them." },
];

/**
 * Announcements from HR: two for the whole company (one important), one for
 * Engineering only, and a draft nobody but HR can see.
 */
export const demoAnnouncements: Array<{
  key: string; title: string; body: string; priority: "normal" | "important";
  department?: string; status: "published" | "draft"; publishedOn?: string; expiresOn?: string;
}> = [
  {
    key: "malaysia-day", title: "Office closed on Malaysia Day", priority: "important", status: "published",
    publishedOn: "2026-09-08", expiresOn: "2026-09-17",
    body: "The office is closed on Wednesday 16 September for Malaysia Day.\n\nIf you are on call that day, your manager will confirm arrangements with you.",
  },
  {
    key: "new-joiners", title: "Welcome to our newest colleagues", priority: "normal", status: "published",
    publishedOn: "2026-08-10",
    body: "Please welcome Syafiqah, who joins Engineering, and Danial, who joins our People team.\n\nSay hello, and find them in the directory to see what they work on.",
  },
  {
    key: "release-freeze", title: "Release freeze before the town hall", priority: "normal", status: "published",
    department: "Engineering", publishedOn: "2026-09-07",
    body: "No production releases from 21 to 24 September while we prepare the quarterly demo. Hotfixes still go through the usual review.",
  },
  {
    key: "year-end-party", title: "Year-end party: save the date", priority: "normal", status: "draft",
    body: "Draft: venue and date to be confirmed with Operations.",
  },
];

/**
 * Onboarding and offboarding checklists, and the plans the demo shows in
 * progress: two new joiners (one whose manager, Nurul, signs in) and one leaver.
 * Task states are fixed so every run shows the same progress.
 */
export const demoLifecycleTemplates: Array<{
  key: string; kind: "onboarding" | "offboarding"; name: string; description: string;
  tasks: Array<{ title: string; role: "employee" | "manager" | "hr"; offset: number; instructions?: string }>;
}> = [
  {
    key: "joiner", kind: "onboarding", name: "New joiner essentials", description: "The first month for anyone joining the company.",
    tasks: [
      { title: "Create accounts and email", role: "hr", offset: -2, instructions: "Work email, HR Nexus sign-in and building pass." },
      { title: "Sign the employment contract", role: "employee", offset: 0 },
      { title: "Add your About and skills to your profile", role: "employee", offset: 3, instructions: "Colleagues find people by skill in the directory." },
      { title: "Plan the first week and introduce a buddy", role: "manager", offset: 1 },
      { title: "Set up payroll and bank details", role: "hr", offset: 5 },
      { title: "Thirty-day check-in", role: "manager", offset: 30 },
    ],
  },
  {
    key: "leaver", kind: "offboarding", name: "Leaver checklist", description: "From notice to the last working day.",
    tasks: [
      { title: "Agree the handover plan", role: "manager", offset: -10 },
      { title: "Hand over open work and documents", role: "employee", offset: -3 },
      { title: "Review final pay and unused leave", role: "hr", offset: -2 },
      { title: "Return laptop and building pass", role: "employee", offset: 0 },
      { title: "Revoke system access", role: "hr", offset: 0 },
    ],
  },
];

export const demoLifecyclePlans: Array<{
  template: string; employeeId: number; startsOn: string; targetDate: string; exitStatus?: "resigned";
  /** Task positions already finished. */
  done: number[];
}> = [
  { template: "joiner", employeeId: 9009, startsOn: "2026-08-03", targetDate: "2026-09-30", done: [1, 2, 3, 4, 5] },
  { template: "joiner", employeeId: 9003, startsOn: "2026-09-07", targetDate: "2026-10-09", done: [1, 2] },
  { template: "leaver", employeeId: 9023, startsOn: "2026-09-01", targetDate: "2026-09-30", exitStatus: "resigned", done: [1] },
];

/**
 * Recognition between colleagues: mostly company-visible, and one private
 * thank-you to Aiman that his own manager, Wei Jian, must not see.
 */
export const demoRecognitions: Array<{
  giver: number; receiver: number; category: "teamwork" | "above_and_beyond" | "customer_focus" | "problem_solving" | "mentoring";
  message: string; visibility: "company" | "private"; givenOn: string;
}> = [
  { giver: 9013, receiver: 9015, category: "customer_focus", visibility: "company", givenOn: "2026-08-28", message: "The client loved the new brochure. Thank you for turning it round in two days." },
  { giver: 9010, receiver: 9011, category: "teamwork", visibility: "company", givenOn: "2026-09-01", message: "Payroll closed a day early this month because you chased every missing timesheet." },
  { giver: 9021, receiver: 9022, category: "customer_focus", visibility: "company", givenOn: "2026-09-01", message: "Closed the renewal and the client asked for you by name." },
  { giver: 9004, receiver: 9005, category: "above_and_beyond", visibility: "company", givenOn: "2026-09-02", message: "Led the payroll service upgrade without a single incident." },
  { giver: 9006, receiver: 9008, category: "problem_solving", visibility: "company", givenOn: "2026-09-04", message: "Found the flaky test that had been failing our builds for weeks." },
  { giver: 9005, receiver: 9006, category: "mentoring", visibility: "private", givenOn: "2026-09-07", message: "Thank you for pairing with Syafiqah every afternoon this week. It made a real difference." },
  { giver: 9001, receiver: 9003, category: "teamwork", visibility: "company", givenOn: "2026-09-08", message: "Great first week: the interview schedule has never been this organised." },
];

/**
 * Goals with their history: Aiman's company goal part-way through, a private
 * one past due, a team goal Wei Jian set for Chloe, a completed company goal
 * for Priya, and one Nurul set for her new joiner.
 */
export const demoGoals: Array<{
  key: string; owner: number; setBy: number; title: string; description: string; visibility: "private" | "team" | "company";
  startsOn: string; dueOn: string; status: "active" | "completed"; progress: number; completedOn?: string;
  updates: Array<{ by: number; on: string; from: number; to: number; status?: "completed"; note?: string }>;
}> = [
  { key: "aiman-speed", owner: 9006, setBy: 9006, visibility: "company", title: "Cut dashboard load time in half", description: "Get the dashboard's first meaningful paint under one second on a mid-range phone.", startsOn: "2026-07-01", dueOn: "2026-10-31", status: "active", progress: 60,
    updates: [{ by: 9006, on: "2026-08-20", from: 0, to: 30, note: "Route-level code splitting is in." }, { by: 9006, on: "2026-09-08", from: 30, to: 60, note: "Images are lazy-loaded; measuring again next week." }] },
  { key: "aiman-course", owner: 9006, setBy: 9006, visibility: "private", title: "Finish the accessibility course", description: "Complete the remaining four modules and write up what applies to our forms.", startsOn: "2026-06-01", dueOn: "2026-09-10", status: "active", progress: 20,
    updates: [{ by: 9006, on: "2026-07-15", from: 0, to: 20 }] },
  { key: "chloe-release", owner: 9007, setBy: 9004, visibility: "team", title: "Own the release checklist", description: "Run the release checklist for every deploy this quarter and keep it current.", startsOn: "2026-07-01", dueOn: "2026-12-31", status: "active", progress: 40,
    updates: [{ by: 9004, on: "2026-08-29", from: 0, to: 40, note: "Two releases run end to end." }] },
  { key: "priya-mentor", owner: 9005, setBy: 9005, visibility: "company", title: "Mentor two new engineers", description: "Pair weekly with each of our two newest engineers through their first quarter.", startsOn: "2026-05-01", dueOn: "2026-09-30", status: "completed", progress: 100, completedOn: "2026-09-05",
    updates: [{ by: 9005, on: "2026-07-01", from: 0, to: 50 }, { by: 9005, on: "2026-09-05", from: 50, to: 100, status: "completed", note: "Both are shipping on their own." }] },
  { key: "danial-onboarding", owner: 9003, setBy: 9001, visibility: "private", title: "Run the next intake's interview schedule", description: "Schedule and track every interview for the October intake.", startsOn: "2026-09-07", dueOn: "2026-10-30", status: "active", progress: 10,
    updates: [{ by: 9003, on: "2026-09-11", from: 0, to: 10 }] },
];

/**
 * Review cycles: a closed annual cycle with Aiman's completed review and his
 * response, and an open mid-year cycle for Engineering and People with every
 * stage showing.
 */
export const demoReviewCycles: Array<{
  key: string; name: string; periodStart: string; periodEnd: string; selfDueOn: string; managerDueOn: string;
  status: "open" | "closed"; openedOn: string; closedOn?: string; departments: string[];
  reviews: Array<{ employee: number; self?: [number, string, string]; manager?: [number, string, string, number]; response?: [string, string] }>;
}> = [
  {
    key: "annual-2025", name: "Annual 2025", periodStart: "2025-01-01", periodEnd: "2025-12-31", selfDueOn: "2026-01-16", managerDueOn: "2026-01-30",
    status: "closed", openedOn: "2026-01-05", closedOn: "2026-02-02", departments: [],
    reviews: [
      { employee: 9006, self: [3, "Shipped the new attendance flow and learned a lot about accessibility along the way.", "2026-01-14"],
        manager: [4, "Aiman delivered the attendance rewrite ahead of schedule and raised our accessibility bar.", "2026-01-28", 9004],
        response: ["Thank you. I would like to lead the next accessibility pass.", "2026-01-29"] },
    ],
  },
  {
    key: "midyear-2026", name: "Mid-year 2026", periodStart: "2026-01-01", periodEnd: "2026-06-30", selfDueOn: "2026-09-20", managerDueOn: "2026-09-30",
    status: "open", openedOn: "2026-09-01", departments: ["Engineering", "Human Resources"],
    reviews: [
      { employee: 9005, self: [4, "Led the payroll service upgrade and mentored two engineers.", "2026-09-04"], manager: [5, "Priya made the payroll upgrade uneventful, which is the highest praise.", "2026-09-09", 9004] },
      { employee: 9007, self: [4, "Took over the release checklist and ran every deploy since July.", "2026-09-10"] },
      { employee: 9002, self: [3, "Handled every leave query within a day and tidied the policy pages.", "2026-09-11"] },
    ],
  },
];

/**
 * A tiny deterministic generator (mulberry32).
 *
 * Attendance needs variation to look real, but the dataset must be identical on
 * every run, so Math.random is not an option. Same seed, same history, always.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
