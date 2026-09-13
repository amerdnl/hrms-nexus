import apiClient from "./axios";
import type {
  ProfileRecognition,
  RecognitionCategory,
  RecognitionFeed,
  RecognitionView,
  RecognitionVisibility,
} from "../types/recognition";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function getRecognition(view: RecognitionView = "company", page = 1, pageSize = 20): Promise<RecognitionFeed> {
  const response = await apiClient.get<Envelope<RecognitionFeed>>("/recognition", { params: { view, page, pageSize } });
  return response.data.data;
}

export async function giveRecognition(input: {
  receiverId: number; category: RecognitionCategory; message: string; visibility: RecognitionVisibility;
}): Promise<{ id: number; givenToday: number; dailyLimit: number }> {
  const response = await apiClient.post<Envelope<{ id: number; givenToday: number; dailyLimit: number }>>("/recognition", input);
  return response.data.data;
}

export async function getPersonRecognition(employeeId: number): Promise<ProfileRecognition> {
  const response = await apiClient.get<Envelope<ProfileRecognition>>(`/people/${employeeId}/recognition`);
  return response.data.data;
}

export async function setRecognitionHidden(id: number, hidden: boolean): Promise<void> {
  await apiClient.put(`/recognition/${id}/hidden`, { hidden });
}
