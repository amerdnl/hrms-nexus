import apiClient from "./axios";
import type {
  AboutMe,
  DirectoryPage,
  OrgNode,
  Relation,
  SocialProfile,
  TimelineEntry,
} from "../types/people";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function getDirectory(params: {
  search?: string; department?: number | null; page?: number; pageSize?: number;
}): Promise<DirectoryPage> {
  const response = await apiClient.get<Envelope<DirectoryPage>>("/people", {
    params: {
      search: params.search || undefined,
      department: params.department ?? undefined,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
  return response.data.data;
}

export async function getPerson(id: number): Promise<SocialProfile> {
  const response = await apiClient.get<Envelope<SocialProfile>>(`/people/${id}`);
  return response.data.data;
}

export async function getPersonTimeline(id: number): Promise<{ relation: Relation; events: TimelineEntry[] }> {
  const response = await apiClient.get<Envelope<{ relation: Relation; events: TimelineEntry[] }>>(`/people/${id}/timeline`);
  return response.data.data;
}

export async function getOrgChart(): Promise<OrgNode[]> {
  const response = await apiClient.get<Envelope<{ nodes: OrgNode[] }>>("/org/chart");
  return response.data.data.nodes;
}

/** The signed-in employee's own colleague-facing profile. */
export async function getAboutMe(): Promise<AboutMe> {
  const response = await apiClient.get<Envelope<AboutMe>>("/profile/about");
  return response.data.data;
}

export async function saveAboutMe(input: AboutMe): Promise<AboutMe> {
  const response = await apiClient.put<Envelope<AboutMe>>("/profile/about", input);
  return response.data.data;
}
