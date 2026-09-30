/**
 * The EDUK8U Group org chart, transcribed for review.
 *
 * SOURCE. "EDUK8U Org Chart", approved by MD on 16 October 2024, supplied by
 * Dr. Roy Prasad. The hierarchy here was read from the connector elements of the
 * original PowerPoint (`p:cxnSp`, whose `stCxn`/`endCxn` name the two shapes each
 * line joins) and checked against the exported PNG. It was not inferred from the
 * reading order of the text, which does not encode the lines at all.
 *
 * NOTHING HERE IS INVENTED. The source names no people, so every row is a
 * position and carries `kind: "vacant"` or `kind: "external"`; none is a person
 * and none claims to be. `name` is the position's label copied from the chart,
 * `jobTitle` is the detail written inside the same box. There are no emails,
 * phone numbers, addresses, dates of birth, salaries, start dates, attendance,
 * leave or payroll: the source contains none, so neither does this file.
 *
 * CONFIDENCE IS PART OF THE DATA. `confidence` records how the reporting line
 * was established, and `note` says why whenever it is not "confirmed":
 *
 *  - confirmed: the PowerPoint binds a connector to both boxes, and the drawn
 *    arrow points from this position to the manager named here.
 *  - grouping: the box joins a shared elbow or spine that several peers use to
 *    reach one manager. The manager is certain; only the individual line is
 *    drawn through a junction rather than box-to-box.
 *  - ambiguous: the chart genuinely does not settle it. Every one of these is a
 *    question for Dr. Roy in docs/EDUK8U_ORG_MAPPING.md, and the chart shows
 *    the position as unconfirmed rather than quietly picking an answer.
 *
 * IDS. 9300-9399, next to but never overlapping the Meridian presentation
 * company's reserved 9200-9299. The bootstrap confines every write to this range.
 */

/** Reserved identifier range. The bootstrap refuses to write outside it. */
export const EDUK8U_ID_MIN = 9300;
export const EDUK8U_ID_MAX = 9399;

export const eduk8uCompany = {
  name: "EDUK8U Group",
  // The source chart is a Malaysian group (KL marketing interns, a KLUST
  // reference, an Australia-facing welfare desk). Asia/Kuala_Lumpur matches the
  // application's existing Malaysian convention.
  timezone: "Asia/Kuala_Lumpur",
} as const;

/**
 * The functional columns of the chart, not a claim about EDUK8U's registered
 * internal departments. The chart is laid out in columns and labels one of them
 * ("SALES / BD Function"); the rest take their name from what the boxes do.
 */
export const eduk8uDepartments = [
  { name: "Executive", description: "Group leadership. From the EDUK8U org chart approved 16 October 2024." },
  { name: "Marketing", description: "Marketing and brand, under the Group Chief Marketing Officer & Co-Founder." },
  { name: "Sales / Business Development", description: "Labelled \"SALES / BD Function\" on the source chart: ICQA, Australia Immersion Recruitment, NOCN, KLUST." },
  { name: "Finance", description: "Company Accountant and finance support." },
  { name: "Technology", description: "LMS, SMS, AI agentic bot and platform development." },
  { name: "Compliance & Quality", description: "Compliance, internal quality assurance and document control." },
  { name: "Student Welfare & Liaison", description: "Welfare liaison and client service, including the Australia desk." },
  { name: "External / Advisory", description: "Consultants, advisers and partners shown below the dividing line on the source chart. Not employed by EDUK8U." },
] as const;

export type Confidence = "confirmed" | "grouping" | "ambiguous";

export interface Eduk8uPosition {
  id: number;
  employeeNumber: string;
  /** The box's label, copied from the chart. Never a person's name. */
  name: string;
  /** The detail written inside the same box, where the box has any. */
  jobTitle: string | null;
  department: string;
  kind: "vacant" | "external";
  /**
   * Whether the seat is taken. Everything on this chart is unfilled except
   * where Dr. Roy has since said otherwise, and a position he has confirmed as
   * filled stays a position: nobody is invented to occupy it.
   */
  occupancy?: "vacant" | "filled_unnamed";
  /** Null for a root of the chart, and for everything below the dividing line. */
  managerId: number | null;
  confidence: Confidence;
  note?: string;
}

/**
 * Above the dividing line: EDUK8U's own structure.
 *
 * The two roots are the Group CEO & CHRO and the Group Chief Marketing Officer &
 * Co-Founder. They are drawn as two roots because the source draws no line
 * between them - see the note on 9302.
 */
export const eduk8uPositions: Eduk8uPosition[] = [
  {
    id: 9301,
    employeeNumber: "EDK-001",
    name: "Group CEO & CHRO",
    jobTitle: null,
    department: "Executive",
    kind: "vacant",
    managerId: null,
    confidence: "confirmed",
    note: "Top of the chart. Every leadership connector points here.",
  },
  {
    id: 9302,
    employeeNumber: "EDK-002",
    name: "Group Chief Marketing Officer & Co-Founder",
    jobTitle: null,
    department: "Executive",
    kind: "vacant",
    managerId: null,
    confidence: "ambiguous",
    note:
      "Shown as a second root because the source draws no connector between this box and the Group CEO & CHRO. " +
      "The two marketing executives point up into this box, but nothing continues from it. Whether a co-founder " +
      "reports to the Group CEO or sits alongside them is a governance question the chart does not answer.",
  },

  // ------------------------------------------------------------------ finance
  {
    id: 9303,
    employeeNumber: "EDK-003",
    name: "Company Accountant",
    jobTitle: null,
    department: "Finance",
    kind: "vacant",
    managerId: 9301,
    confidence: "confirmed",
  },
  {
    id: 9304,
    employeeNumber: "EDK-004",
    name: "Finance Admin Intern",
    jobTitle: null,
    department: "Finance",
    kind: "vacant",
    managerId: 9303,
    confidence: "confirmed",
  },

  // --------------------------------------------------------- sales / business
  {
    id: 9305,
    employeeNumber: "EDK-005",
    name: "1. Snr BD Exec Recruitment",
    jobTitle: null,
    department: "Sales / Business Development",
    kind: "vacant",
    managerId: 9301,
    confidence: "confirmed",
  },
  {
    id: 9306,
    employeeNumber: "EDK-006",
    name: "2. Snr BD Exec Recruitment",
    jobTitle: null,
    department: "Sales / Business Development",
    kind: "vacant",
    managerId: 9301,
    confidence: "grouping",
    note: "Reaches the Group CEO through the elbow the three BD executives share, rather than by its own box-to-box line.",
  },
  {
    id: 9307,
    employeeNumber: "EDK-007",
    name: "3. Snr BD Exec Recruitment",
    jobTitle: null,
    department: "Sales / Business Development",
    kind: "vacant",
    managerId: 9301,
    confidence: "grouping",
    note: "Reaches the Group CEO through the elbow the three BD executives share, rather than by its own box-to-box line.",
  },
  {
    id: 9308,
    employeeNumber: "EDK-008",
    name: "Admin Intern - Tracking, Support, Docs",
    jobTitle: null,
    department: "Sales / Business Development",
    kind: "vacant",
    managerId: 9305,
    confidence: "confirmed",
    note:
      "The bracket down the left of the BD column joins this box to all three senior BD executives, and Dr. Roy " +
      "has confirmed that interns report to every executive above them. All three are recorded: the first as the " +
      "operational manager, the other two as additional reporting lines.",
  },

  // ---------------------------------------------------------------- marketing
  {
    id: 9309,
    employeeNumber: "EDK-009",
    name: "1. Marketing Exec.",
    jobTitle: "GD, SEM, SEO, Brand, Lead Gen & GHL",
    department: "Marketing",
    kind: "vacant",
    managerId: 9302,
    confidence: "confirmed",
  },
  {
    id: 9310,
    employeeNumber: "EDK-010",
    name: "2. Marketing Exec.",
    jobTitle: "GD, SEM, SEO, Brand, Lead Gen",
    department: "Marketing",
    kind: "vacant",
    managerId: 9302,
    confidence: "confirmed",
  },
  {
    id: 9311,
    employeeNumber: "EDK-011",
    name: "Marketing: GD Intern KL X 2",
    jobTitle: null,
    department: "Marketing",
    kind: "vacant",
    managerId: 9309,
    confidence: "confirmed",
    note:
      "Dr. Roy has confirmed that interns report to every executive above them, which is what the source's two " +
      "arrows out of this box show. Both marketing executives are recorded: the first as the operational manager, " +
      "the second as an additional reporting line. The box stands for two interns.",
  },

  // --------------------------------------------------------------- technology
  {
    id: 9312,
    employeeNumber: "EDK-012",
    name: "1. Tech Developer",
    jobTitle: "LMS, SMS, AI Agentic Bot, Platforms",
    department: "Technology",
    kind: "vacant",
    managerId: 9301,
    confidence: "grouping",
    note: "Reaches the Group CEO through the spine the three developers share.",
  },
  {
    id: 9313,
    employeeNumber: "EDK-013",
    name: "2. Tech Developer",
    jobTitle: "LMS, SMS, AI Agentic Bot, Platforms",
    department: "Technology",
    kind: "vacant",
    managerId: 9301,
    confidence: "grouping",
    note: "Reaches the Group CEO through the spine the three developers share.",
  },
  {
    id: 9314,
    employeeNumber: "EDK-014",
    name: "3. Tech Developer",
    jobTitle: "LMS, SMS, AI Agentic Bot, Platforms",
    department: "Technology",
    kind: "vacant",
    managerId: 9301,
    confidence: "confirmed",
  },
  {
    id: 9315,
    employeeNumber: "EDK-015",
    name: "2 X Tech Intern",
    jobTitle: "Prodigy Development, API Integration, Web Dev, LMS",
    department: "Technology",
    kind: "vacant",
    managerId: 9312,
    confidence: "confirmed",
    note:
      "The spine runs past all three developers, and Dr. Roy has confirmed that interns report to every member of " +
      "staff above them. All three are recorded: the first as the operational manager, the other two as additional " +
      "reporting lines. The box stands for two interns.",
  },

  // ------------------------------------------------------- compliance/quality
  {
    id: 9316,
    employeeNumber: "EDK-016",
    name: "Head of Compliance & Quality Management",
    jobTitle: null,
    department: "Compliance & Quality",
    kind: "vacant",
    // Dr. Roy has confirmed this post is filled. Who holds it has not been
    // given, so the chart says "filled, employee details not entered" and no
    // employee is conjured to stand in for them.
    occupancy: "filled_unnamed",
    managerId: 9301,
    confidence: "confirmed",
  },
  {
    id: 9317,
    employeeNumber: "EDK-017",
    name: "Internal Quality Assurance / Compliance Admin / Doc Controller",
    jobTitle: null,
    department: "Compliance & Quality",
    kind: "vacant",
    managerId: 9316,
    confidence: "confirmed",
  },

  // -------------------------------------------------------- welfare / liaison
  {
    id: 9318,
    employeeNumber: "EDK-018",
    name: "Welfare Liaison & Client Service AU TBH",
    jobTitle: null,
    department: "Student Welfare & Liaison",
    kind: "vacant",
    managerId: 9301,
    confidence: "confirmed",
    note: "\"TBH\" is copied from the source and has not been interpreted.",
  },
  {
    id: 9319,
    employeeNumber: "EDK-019",
    name: "Liaison Officer (1: 36) TBH",
    jobTitle: null,
    department: "Student Welfare & Liaison",
    kind: "vacant",
    managerId: 9318,
    confidence: "confirmed",
  },
  {
    id: 9320,
    employeeNumber: "EDK-020",
    name: "Liaison Officer (1: 36) TBH",
    jobTitle: null,
    department: "Student Welfare & Liaison",
    kind: "vacant",
    managerId: 9319,
    confidence: "ambiguous",
    note:
      "The chart draws an arrow from this box into the identical Liaison Officer box above it, which is recorded " +
      "here as drawn. Two posts with the same title and the same (1: 36) ratio are more likely peers both under " +
      "the Welfare Liaison, stacked for layout. Worth confirming before anyone is hired into either.",
  },
  {
    id: 9321,
    employeeNumber: "EDK-021",
    name: "CEO Special Officer",
    // The source writes "Individual Contributor" beside this box, in a
    // different style from every other label on the chart. It describes this
    // post - it leads nobody - so it is carried as the post's own description
    // rather than created as a second box that does not exist.
    jobTitle: "Individual Contributor",
    department: "Executive",
    kind: "vacant",
    managerId: 9301,
    confidence: "confirmed",
    note:
      "The source writes this beside the line into the Group CEO, outside any box. Dr. Roy has since confirmed the " +
      "post: one position, an individual contributor, reporting to the Group CEO & CHRO, leading nobody. " +
      "\"Individual Contributor\" describes this same post and is carried as its job title, not as a second box.",
  },
];

/**
 * Below the dividing line: parties who appear on the chart without being
 * employed by EDUK8U. None has a reporting line, because the source draws none
 * for any of them, so the chart lists them as external rather than hanging them
 * off a manager. Firm and individual identifiers ("ARK Legal", "MK") are copied
 * from the source and not expanded.
 */
export const eduk8uExternal: Eduk8uPosition[] = [
  { id: 9330, employeeNumber: "EDK-030", name: "SEO Consultant (Ext)", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
  { id: 9331, employeeNumber: "EDK-031", name: "EGSA - Resellers & Franchisees & Satellite Centres", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed", note: "A partner channel rather than one post. Kept as a single entry because the chart draws a single box." },
  { id: 9332, employeeNumber: "EDK-032", name: "Chartered & Tax Accountant", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
  { id: 9333, employeeNumber: "EDK-033", name: "Auditor", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
  { id: 9334, employeeNumber: "EDK-034", name: "External Legal - ARK Legal", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
  { id: 9335, employeeNumber: "EDK-035", name: "Employment Lawyer - MK", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
  { id: 9336, employeeNumber: "EDK-036", name: "Consultant - Trello", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
  { id: 9337, employeeNumber: "EDK-037", name: "Consultant - Vultr Cloud", jobTitle: null, department: "External / Advisory", kind: "external", managerId: null, confidence: "confirmed" },
];

/**
 * Text on the chart that labels something rather than naming a post. None of it
 * is loaded as a position, because doing so would invent a seat that the chart
 * does not draw. Listed here so the omissions are deliberate and reviewable.
 */
export const eduk8uAnnotations = [
  {
    label: "SALES / BD Function: 1. ICQA  2. Australia Immersion Recruitment  3. NOCN  4. KLUST",
    reading: "A heading over the BD column naming the four streams it sells into, not a post. Recorded as the description of the Sales / Business Development department.",
  },
  {
    label: "Individual Contributor",
    reading: "A classification beside \"CEO Special Officer\", in a different style from every box on the chart. Read as a label for that post rather than as a post of its own.",
  },
  {
    label: "Approved by MD - 16 October 2024",
    reading: "The chart's approval footer. Recorded in the documentation as the source's date.",
  },
  {
    label: "EDUK8U | TVET SchoolAsia, Work Ready Asia, MISB, ICQA, Attend Care",
    reading: "A brand panel down the right-hand edge. Logos, with no connector to any box, so no reporting line can be read from them.",
  },
];

export const eduk8uAll = (): Eduk8uPosition[] => [...eduk8uPositions, ...eduk8uExternal];

/**
 * How each reporting line is stored, so the chart can show an unsettled line as
 * unsettled instead of asserting it (employees.reporting_line_confidence).
 *
 * `grouping` becomes `inferred`: the manager is not in doubt, only the drawing
 * route is, so the chart draws it normally. `ambiguous` becomes `unconfirmed`,
 * which the chart marks, because those are the lines Dr. Roy has to answer.
 */
export const reportingLineConfidence = (
  position: Eduk8uPosition,
): "confirmed" | "inferred" | "unconfirmed" | null => {
  if (position.managerId === null) return null;
  if (position.confidence === "ambiguous") return "unconfirmed";
  return position.confidence === "grouping" ? "inferred" : "confirmed";
};

/**
 * Where each box sits on the source chart, in the PowerPoint's own inches with
 * the origin at the top-left of the slide.
 *
 * These are read straight out of the shape definitions (`a:off` and `a:ext` on
 * each `p:sp`), not estimated from the picture. They exist because an org chart
 * laid out by an algorithm is correct and unrecognisable: it puts the boxes
 * where it likes, which is never where the author put them. This chart goes back
 * to the person who drew it, so it has to look like the thing he drew.
 *
 * `shape` is the PowerPoint shape id, kept so any of this can be checked against
 * the file. Where one source box holds several entries - the four advisers in
 * one box, the two consultants in another - the entries share that box's column
 * and stack down from its top, which is how the box itself reads.
 */
export interface SourceBox {
  shape: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const eduk8uSourceLayout: Record<number, SourceBox> = {
  // Columns are teams, rows are levels. A team's members sit in one column so
  // they stay together: three BD executives are a group, and a group scattered
  // across a wide row stops reading as one. `shape` is kept as the PowerPoint
  // shape this position came from, so any of it can still be traced back.
  //
  // x: Marketing 0.2 | Sales/BD 1.9 | Finance 3.6 | Technology 5.3 |
  //    Compliance 7.0 | Welfare 8.7
  // y: leadership 0.2, then 1.7, 3.0, 4.3, 5.6 down each column.

  // ------------------------------------------------------------- leadership
  9302: { shape: 25, x: 0.20, y: 0.20, width: 1.34, height: 0.6 },  // Group CMO & Co-Founder
  9301: { shape: 24, x: 3.60, y: 0.20, width: 1.34, height: 0.6 },  // Group CEO & CHRO
  // Beside the CEO and a little to its right, above Compliance and Welfare.
  9321: { shape: 37, x: 6.15, y: 0.20, width: 1.34, height: 0.6 },  // CEO Special Officer

  // -------------------------------------------------------------- marketing
  9309: { shape: 31, x: 0.20, y: 1.70, width: 1.34, height: 0.6 },
  9310: { shape: 60, x: 0.20, y: 3.00, width: 1.34, height: 0.6 },
  9311: { shape: 30, x: 0.20, y: 4.30, width: 1.34, height: 0.6 },  // GD interns

  // ------------------------------------------------------------- sales / BD
  9305: { shape: 26, x: 1.90, y: 1.70, width: 1.34, height: 0.6 },
  9306: { shape: 27, x: 1.90, y: 3.00, width: 1.34, height: 0.6 },
  9307: { shape: 29, x: 1.90, y: 4.30, width: 1.34, height: 0.6 },
  9308: { shape: 42, x: 1.90, y: 5.60, width: 1.34, height: 0.6 },  // admin intern

  // ---------------------------------------------------------------- finance
  9303: { shape: 28, x: 3.60, y: 1.70, width: 1.34, height: 0.6 },
  9304: { shape: 34, x: 3.60, y: 3.00, width: 1.34, height: 0.6 },

  // ------------------------------------------------------------- technology
  9312: { shape: 23, x: 5.30, y: 1.70, width: 1.34, height: 0.6 },
  9313: { shape: 66, x: 5.30, y: 3.00, width: 1.34, height: 0.6 },
  9314: { shape: 67, x: 5.30, y: 4.30, width: 1.34, height: 0.6 },
  9315: { shape: 36, x: 5.30, y: 5.60, width: 1.34, height: 0.6 },  // tech interns

  // ------------------------------------------------------- compliance/quality
  9316: { shape: 43, x: 7.00, y: 1.70, width: 1.34, height: 0.6 },
  9317: { shape: 44, x: 7.00, y: 3.00, width: 1.34, height: 0.6 },

  // -------------------------------------------------------- welfare/liaison
  9318: { shape: 33, x: 8.70, y: 1.70, width: 1.34, height: 0.6 },
  9319: { shape: 32, x: 8.70, y: 3.00, width: 1.34, height: 0.6 },
  9320: { shape: 58, x: 8.70, y: 4.30, width: 1.34, height: 0.6 },

  // ------------------------------------- external / advisory, below the rule
  9330: { shape: 45, x: 0.20, y: 7.20, width: 1.34, height: 0.6 },
  9331: { shape: 50, x: 1.90, y: 7.20, width: 1.34, height: 0.6 },
  9332: { shape: 48, x: 3.60, y: 7.20, width: 1.34, height: 0.6 },
  9333: { shape: 48, x: 5.30, y: 7.20, width: 1.34, height: 0.6 },
  9334: { shape: 48, x: 7.00, y: 7.20, width: 1.34, height: 0.6 },
  9335: { shape: 48, x: 8.70, y: 7.20, width: 1.34, height: 0.6 },
  9336: { shape: 47, x: 0.20, y: 8.50, width: 1.34, height: 0.6 },
  9337: { shape: 47, x: 1.90, y: 8.50, width: 1.34, height: 0.6 },
};

/** The source slide's own extent, in the same inches. */
export const eduk8uSourceCanvas = { width: 13.33, height: 7.5 };

/** Where the source rules off its own organisation from everyone outside it. */
export const eduk8uSourceDivider = 5.24;

/**
 * Lines the source draws that are not the employee's reporting line.
 *
 * Only one so far, and it is the reason this concept exists: the GD interns box
 * has two connectors leaving it, one into each marketing executive. An employee
 * record holds a single manager, so the second line has nowhere to live as
 * hierarchy. Throwing it away would hide something the source plainly shows, and
 * adding a second manager column to hold it would be a schema change made to
 * please one drawing. It is recorded as what it is - a line on the chart - and
 * drawn as a reference rather than as a reporting line.
 */
/**
 * Reporting lines the chart draws in addition to each position's operational
 * manager.
 *
 * Dr. Roy has confirmed that an intern reports to every member of staff above
 * them, not to one of them. `employees.manager_id` holds a single line because
 * leave approval and team scope need one unambiguous answer, so the first is
 * recorded there and the rest here. Both are drawn; only the first decides
 * anything operational.
 */
export const eduk8uSourceLinks: Array<{
  childId: number;
  parentId: number;
  confidence: "confirmed" | "inferred" | "unconfirmed";
  note: string;
}> = [
  // Marketing GD interns, to both marketing executives.
  { childId: 9311, parentId: 9310, confidence: "confirmed",
    note: "Confirmed by Dr. Roy: the interns report to both marketing executives." },
  // Admin intern, to all three senior BD executives.
  { childId: 9308, parentId: 9306, confidence: "confirmed",
    note: "Confirmed by Dr. Roy: the intern reports to all three senior BD executives." },
  { childId: 9308, parentId: 9307, confidence: "confirmed",
    note: "Confirmed by Dr. Roy: the intern reports to all three senior BD executives." },
  // Tech interns, to all three developers.
  { childId: 9315, parentId: 9313, confidence: "confirmed",
    note: "Confirmed by Dr. Roy: the interns report to all three tech developers." },
  { childId: 9315, parentId: 9314, confidence: "confirmed",
    note: "Confirmed by Dr. Roy: the interns report to all three tech developers." },
];

/**
 * Boxes the source draws which are not posts.
 *
 * The chart has one: a reference box between the marketing and BD columns
 * listing the four streams the BD function sells into. It is not a person and
 * not a position, so it is not an employee record - but leaving it out leaves a
 * hole where the author put something, and the chart is going back to him. It
 * is drawn as a plain labelled note, visibly not a card.
 */
export const eduk8uSourceNotes: Array<{
  label: string;
  body: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}> = [
  {
    label: "SALES / BD Function",
    body: "1. ICQA\n2. Australia Immersion Recruitment\n3. NOCN\n4. KLUST",
    x: 1.90,
    y: 0.20,
    width: 1.34,
    height: 0.9,
  },
  {
    // The source's own approval footer, kept where the source puts it. It
    // records that Dr. Roy's chart was approved on that date - never that this
    // reconstruction of it was.
    label: "Source chart: approved by MD - 16 October 2024",
    body: null,
    x: 7.00,
    y: 8.55,
    width: 2.20,
    height: 0.35,
  },
];
