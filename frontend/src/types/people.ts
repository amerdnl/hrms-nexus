/**
 * The social layer, as the server sends it. There is deliberately no field
 * here for pay, attendance, leave, date of birth, address or account state:
 * the directory endpoints never select them, so the client cannot show them.
 */
export type Relation = "self" | "admin" | "manager" | "coworker";

/**
 * What a record describes. `staff` is a person employed here and is what an
 * ordinary record carries. `vacant` is a position on the org chart that nobody
 * holds, whose name is the position's label rather than a person's name.
 * `external` is a consultant, firm or partner who appears on the chart without
 * being employed here. The interface labels the two exceptions, so a placeholder
 * is never read as a colleague.
 */
export type PositionKind = "staff" | "vacant" | "external";

/**
 * How far an employee's recorded reporting line can be trusted, when something
 * has graded it. Null is the ordinary case: nobody graded it, so the chart
 * draws the line plainly. `unconfirmed` means the source the chart was
 * transcribed from does not settle it, and the chart says so.
 */
export type ReportingLineConfidence = "confirmed" | "inferred" | "unconfirmed";

export interface PersonCard {
  id: number;
  fullName: string;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  profileImage: string | null;
  skills: string[];
  positionKind: PositionKind;
}

export interface DirectoryPage {
  people: PersonCard[];
  total: number;
  page: number;
  pageSize: number;
  departments: Array<{ id: number; name: string; people: number }>;
}

export interface PersonLink {
  id: number;
  fullName: string;
  jobTitle: string | null;
  profileImage: string | null;
}

export interface SocialProfile {
  relation: Relation;
  /** Which other areas this viewer may open for this person. Advisory. */
  layers: string[];
  person: {
    id: number;
    fullName: string;
    jobTitle: string | null;
    department: { id: number; name: string } | null;
    profileImage: string | null;
    workEmail: string | null;
    phone: string | null;
    sharesPhone: boolean;
    about: string | null;
    skills: string[];
    employmentDate: string | null;
    /** Only for the person themselves and for HR. */
    employmentStatus: string | null;
  };
  manager: PersonLink | null;
  directReports: PersonLink[];
  peers: PersonLink[];
  chain: PersonLink[];
}

export type TimelineVisibility = "company" | "self" | "management";

export interface TimelineEntry {
  id: string;
  kind: string;
  visibility: TimelineVisibility;
  occurredOn: string;
  title: string;
  detail: unknown;
}

/** A box's place on the drawing a company's chart was transcribed from. */
export interface OrgLayoutBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A labelled box on the source chart that describes no post. */
export interface OrgSourceNote {
  id: number;
  label: string;
  body: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A line the source drawing shows which is not the employee's reporting line -
 * a second manager the record cannot hold, for instance. Drawn as a reference,
 * visibly not a reporting line, and it never affects the hierarchy.
 */
export interface OrgSourceLink {
  childId: number;
  parentId: number;
  confidence: ReportingLineConfidence;
  note: string | null;
}

export interface OrgNode extends PersonLink {
  departmentName: string | null;
  managerId: number | null;
  positionKind: PositionKind;
  reportingLineConfidence: ReportingLineConfidence | null;
  /**
   * Whether the seat is taken. `filled_unnamed` means somebody holds it and who
   * has not been recorded - stated plainly rather than filled with an invented
   * name. Null for an ordinary employee, where the question does not apply.
   */
  occupancy: "vacant" | "filled" | "filled_unnamed" | null;
  notes: string | null;
  departmentId: number | null;
  /** Everyone this position also reports to, beyond its primary manager. */
  alsoReportsTo: number[];
}

export interface AboutMe {
  about: string | null;
  skills: string[];
  sharePhone: boolean;
}
