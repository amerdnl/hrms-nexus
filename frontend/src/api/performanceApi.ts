import apiClient from "./axios";
import type {
  GoalDetail,
  GoalInput,
  GoalList,
  GoalRelation,
  GoalStatus,
  ReviewCycle,
  ReviewDetail,
  ReviewSummary,
} from "../types/performance";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// ------------------------------------------------------------ goals

export async function getMyGoals(): Promise<GoalList> {
  return (await apiClient.get<Envelope<GoalList>>("/goals/mine")).data.data;
}

export async function getTeamGoals(): Promise<GoalList> {
  return (await apiClient.get<Envelope<GoalList>>("/goals/team")).data.data;
}

export async function getPersonGoals(employeeId: number): Promise<GoalList & { relation: GoalRelation }> {
  return (await apiClient.get<Envelope<GoalList & { relation: GoalRelation }>>(`/goals/people/${employeeId}`)).data.data;
}

export async function getGoal(id: number): Promise<GoalDetail> {
  return (await apiClient.get<Envelope<GoalDetail>>(`/goals/${id}`)).data.data;
}

export async function createGoal(input: GoalInput): Promise<number> {
  return (await apiClient.post<Envelope<{ id: number }>>("/goals", input)).data.data.id;
}

export async function updateGoal(id: number, input: Omit<GoalInput, "ownerId"> & { revision: number }): Promise<void> {
  await apiClient.put(`/goals/${id}`, input);
}

export async function recordGoalProgress(id: number, input: { progress: number; status: GoalStatus; note: string | null }): Promise<string> {
  const response = await apiClient.post<Envelope<unknown>>(`/goals/${id}/updates`, input);
  return response.data.message ?? "Progress recorded.";
}

// ------------------------------------------------------------ reviews

export async function getMyReviews(): Promise<{ today: string; reviews: ReviewSummary[] }> {
  return (await apiClient.get<Envelope<{ today: string; reviews: ReviewSummary[] }>>("/reviews/mine")).data.data;
}

export async function getTeamReviews(): Promise<{ today: string; reviews: ReviewSummary[] }> {
  return (await apiClient.get<Envelope<{ today: string; reviews: ReviewSummary[] }>>("/reviews/team")).data.data;
}

export async function getReview(id: number): Promise<ReviewDetail> {
  return (await apiClient.get<Envelope<ReviewDetail>>(`/reviews/participants/${id}`)).data.data;
}

export async function writeReview(id: number, side: "self" | "manager", input: { summary: string | null; rating: number | null; submit: boolean }): Promise<string> {
  const response = await apiClient.put<Envelope<unknown>>(`/reviews/participants/${id}/${side}`, input);
  return response.data.message ?? "Saved.";
}

export async function respondToReview(id: number, text: string): Promise<void> {
  await apiClient.put(`/reviews/participants/${id}/response`, { response: text });
}

export async function getCycles(): Promise<ReviewCycle[]> {
  return (await apiClient.get<Envelope<{ cycles: ReviewCycle[] }>>("/reviews/cycles")).data.data.cycles;
}

export async function getCycle(id: number): Promise<{ today: string; cycle: ReviewCycle; participants: ReviewSummary[] }> {
  return (await apiClient.get<Envelope<{ today: string; cycle: ReviewCycle; participants: ReviewSummary[] }>>(`/reviews/cycles/${id}`)).data.data;
}

export interface CycleInput {
  name: string;
  periodStart: string;
  periodEnd: string;
  selfDueOn: string;
  managerDueOn: string;
}

export async function createCycle(input: CycleInput): Promise<number> {
  return (await apiClient.post<Envelope<{ id: number }>>("/reviews/cycles", input)).data.data.id;
}

export async function updateCycle(id: number, input: CycleInput & { revision: number }): Promise<void> {
  await apiClient.put(`/reviews/cycles/${id}`, input);
}

export async function openCycle(id: number, departmentId: number | null): Promise<string> {
  const response = await apiClient.post<Envelope<unknown>>(`/reviews/cycles/${id}/open`, { departmentId });
  return response.data.message ?? "Opened.";
}

export async function closeCycle(id: number): Promise<string> {
  const response = await apiClient.post<Envelope<unknown>>(`/reviews/cycles/${id}/close`);
  return response.data.message ?? "Closed.";
}
