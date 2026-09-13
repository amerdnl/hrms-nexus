/** Recognition between colleagues, as the server returns it for the signed-in account. */

export type RecognitionCategory = "teamwork" | "above_and_beyond" | "customer_focus" | "problem_solving" | "mentoring";
export type RecognitionVisibility = "company" | "private";
export type RecognitionView = "company" | "received" | "given" | "all";

export const categoryLabels: Record<RecognitionCategory, string> = {
  teamwork: "Teamwork",
  above_and_beyond: "Above and beyond",
  customer_focus: "Customer focus",
  problem_solving: "Problem solving",
  mentoring: "Mentoring",
};

export interface RecognitionPerson {
  id: number;
  fullName: string;
  jobTitle: string | null;
  profileImage: string | null;
}

export interface RecognitionItem {
  id: number;
  category: RecognitionCategory;
  categoryLabel: string;
  message: string;
  visibility: RecognitionVisibility;
  givenOn: string;
  createdAt: string;
  giver: RecognitionPerson;
  receiver: RecognitionPerson;
  isGiver: boolean;
  isReceiver: boolean;
  /** Present for HR only. */
  hidden?: boolean;
}

export interface RecognitionFeed {
  items: RecognitionItem[];
  total: number;
  page: number;
  pageSize: number;
  givenToday: number | null;
  dailyLimit: number;
}

export interface ProfileRecognition {
  items: RecognitionItem[];
  byCategory: Array<{ category: RecognitionCategory; label: string; count: number }>;
}
