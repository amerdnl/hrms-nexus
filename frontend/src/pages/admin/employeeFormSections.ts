import { Briefcase, UserPlus, UserRound, type LucideIcon } from "lucide-react";

/**
 * The card sections both employee forms use.
 *
 * Shared because Add and Edit had drifted into different shapes for the same
 * record - Add grouped its fields into three cards while Edit put all thirteen
 * in one, and `phone` sat under contact details in Add and beside the email in
 * Edit. The references show the two as the same form. Defining the grouping
 * once means the next field added has one obvious home rather than two.
 */
export interface EmployeeFormSection {
  title: string;
  description?: string;
  icon: LucideIcon;
}

export const accountSection: EmployeeFormSection = {
  title: "Account",
  description: "Identifies the employee and their sign-in.",
  icon: UserPlus,
};

export const employmentSection: EmployeeFormSection = {
  title: "Employment",
  description: "Role, department and standing.",
  icon: Briefcase,
};

export const personalSection: EmployeeFormSection = {
  title: "Personal and contact",
  description: "Contact details and next of kin.",
  icon: UserRound,
};
