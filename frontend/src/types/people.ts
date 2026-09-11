/**
 * The social layer, as the server sends it. There is deliberately no field
 * here for pay, attendance, leave, date of birth, address or account state:
 * the directory endpoints never select them, so the client cannot show them.
 */
export type Relation = "self" | "admin" | "manager" | "coworker";

export interface PersonCard {
  id: number;
  fullName: string;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  profileImage: string | null;
  skills: string[];
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

export interface OrgNode extends PersonLink {
  departmentName: string | null;
  managerId: number | null;
}

export interface AboutMe {
  about: string | null;
  skills: string[];
  sharePhone: boolean;
}
