import apiClient from "./axios";
import type {
  ExitStatus,
  LifecycleKind,
  LifecyclePlan,
  LifecycleTemplate,
  MyWork,
  PlanDetail,
  PlanStatus,
  TaskStatus,
  TemplateTask,
} from "../types/lifecycle";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function getTemplates(kind?: LifecycleKind): Promise<LifecycleTemplate[]> {
  const response = await apiClient.get<Envelope<{ templates: LifecycleTemplate[] }>>("/lifecycle/templates", { params: { kind } });
  return response.data.data.templates;
}

export async function createTemplate(input: {
  kind: LifecycleKind; name: string; description: string | null; tasks: TemplateTask[];
}): Promise<number> {
  const response = await apiClient.post<Envelope<{ id: number }>>("/lifecycle/templates", input);
  return response.data.data.id;
}

export async function updateTemplate(id: number, input: {
  name: string; description: string | null; isActive: boolean; tasks: TemplateTask[]; revision: number;
}): Promise<void> {
  await apiClient.put(`/lifecycle/templates/${id}`, input);
}

export async function getPlans(params: { kind?: LifecycleKind; status?: PlanStatus } = {}): Promise<{ today: string; plans: LifecyclePlan[] }> {
  const response = await apiClient.get<Envelope<{ today: string; plans: LifecyclePlan[] }>>("/lifecycle/plans", { params });
  return response.data.data;
}

export async function startPlan(input: {
  employeeId: number; kind: LifecycleKind; templateId: number; startsOn: string; targetDate: string; exitStatus?: ExitStatus | null;
}): Promise<{ id: number; message: string }> {
  const response = await apiClient.post<Envelope<{ id: number }>>("/lifecycle/plans", input);
  return { id: response.data.data.id, message: response.data.message ?? "Plan started." };
}

export async function getPlan(id: number): Promise<PlanDetail> {
  const response = await apiClient.get<Envelope<PlanDetail>>(`/lifecycle/plans/${id}`);
  return response.data.data;
}

export async function completePlan(id: number): Promise<string> {
  const response = await apiClient.post<Envelope<{ deactivated: boolean }>>(`/lifecycle/plans/${id}/complete`);
  return response.data.message ?? "Plan completed.";
}

export async function cancelPlan(id: number): Promise<string> {
  const response = await apiClient.post<Envelope<unknown>>(`/lifecycle/plans/${id}/cancel`);
  return response.data.message ?? "Plan cancelled.";
}

export async function getMyWork(): Promise<MyWork> {
  const response = await apiClient.get<Envelope<MyWork>>("/lifecycle/my-work");
  return response.data.data;
}

export async function updateTask(id: number, input: { status: TaskStatus; note?: string | null }): Promise<{ message: string; planCompleted: boolean }> {
  const response = await apiClient.put<Envelope<{ planCompleted: boolean }>>(`/lifecycle/tasks/${id}`, input);
  return { message: response.data.message ?? "Task updated.", planCompleted: response.data.data.planCompleted };
}
