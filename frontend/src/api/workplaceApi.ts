import apiClient from "./axios";
import type {
  ActionCenter,
  Announcement,
  AnnouncementFeed,
  AnnouncementInput,
  AnnouncementManagePage,
  AnnouncementStatus,
  CalendarConfig,
  CalendarData,
  CompanyEvent,
  CompanyEventInput,
  CompanyHoliday,
  Holiday,
  NotificationPage,
  SearchResults,
} from "../types/workplace";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// ------------------------------------------------------------ notifications

export async function getNotifications(params: {
  filter?: "all" | "unread"; before?: number | null; limit?: number;
} = {}): Promise<NotificationPage> {
  const response = await apiClient.get<Envelope<NotificationPage>>("/notifications", {
    params: { filter: params.filter, before: params.before ?? undefined, limit: params.limit },
  });
  return response.data.data;
}

export async function getUnreadCount(): Promise<number> {
  const response = await apiClient.get<Envelope<{ unreadCount: number }>>("/notifications/unread-count");
  return response.data.data.unreadCount;
}

export async function markNotificationRead(id: number): Promise<number> {
  const response = await apiClient.put<Envelope<{ unreadCount: number }>>(`/notifications/${id}/read`);
  return response.data.data.unreadCount;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.put("/notifications/read-all");
}

// ------------------------------------------------------------ action center & search

export async function getActionCenter(): Promise<ActionCenter> {
  const response = await apiClient.get<Envelope<ActionCenter>>("/action-center");
  return response.data.data;
}

export async function searchWorkplace(query: string, signal?: AbortSignal): Promise<SearchResults> {
  const response = await apiClient.get<Envelope<SearchResults>>("/search", { params: { q: query }, signal });
  return response.data.data;
}

// ------------------------------------------------------------ calendar

export async function getCalendar(params: {
  from: string; to: string; department?: number | null; team?: boolean;
}): Promise<CalendarData> {
  const response = await apiClient.get<Envelope<CalendarData>>("/calendar", {
    params: {
      from: params.from,
      to: params.to,
      department: params.department ?? undefined,
      team: params.team ? "1" : undefined,
    },
  });
  return response.data.data;
}

export async function getCalendarConfig(): Promise<CalendarConfig & { holidays: CompanyHoliday[] }> {
  const response = await apiClient.get<Envelope<CalendarConfig & { holidays: CompanyHoliday[] }>>("/company/calendar-config");
  return response.data.data;
}

export async function listHolidays(year?: number): Promise<{ year: number; holidays: Holiday[] }> {
  const response = await apiClient.get<Envelope<{ year: number; holidays: Holiday[] }>>("/settings/holidays", {
    params: { year },
  });
  return response.data.data;
}

export async function createHoliday(input: { date: string; name: string }): Promise<Holiday> {
  const response = await apiClient.post<Envelope<{ holiday: Holiday }>>("/settings/holidays", input);
  return response.data.data.holiday;
}

export async function updateHoliday(id: number, input: { date: string; name: string; revision: number }): Promise<Holiday> {
  const response = await apiClient.put<Envelope<{ holiday: Holiday }>>(`/settings/holidays/${id}`, input);
  return response.data.data.holiday;
}

export async function deleteHoliday(id: number): Promise<void> {
  await apiClient.delete(`/settings/holidays/${id}`);
}

export async function createEvent(input: CompanyEventInput): Promise<CompanyEvent> {
  const response = await apiClient.post<Envelope<{ event: CompanyEvent }>>("/calendar/events", input);
  return response.data.data.event;
}

export async function updateEvent(id: number, input: CompanyEventInput & { revision: number }): Promise<CompanyEvent> {
  const response = await apiClient.put<Envelope<{ event: CompanyEvent }>>(`/calendar/events/${id}`, input);
  return response.data.data.event;
}

export async function deleteEvent(id: number): Promise<void> {
  await apiClient.delete(`/calendar/events/${id}`);
}

// ------------------------------------------------------------ announcements

export async function getAnnouncements(page = 1, pageSize = 20): Promise<AnnouncementFeed> {
  const response = await apiClient.get<Envelope<AnnouncementFeed>>("/announcements", { params: { page, pageSize } });
  return response.data.data;
}

export async function getAnnouncement(id: number): Promise<Announcement> {
  const response = await apiClient.get<Envelope<{ announcement: Announcement }>>(`/announcements/${id}`);
  return response.data.data.announcement;
}

export async function markAnnouncementRead(id: number): Promise<void> {
  await apiClient.put(`/announcements/${id}/read`);
}

export async function getManagedAnnouncements(
  status: AnnouncementStatus | "all" = "all",
  page = 1,
): Promise<AnnouncementManagePage> {
  const response = await apiClient.get<Envelope<AnnouncementManagePage>>("/announcements/manage", {
    params: { status, page },
  });
  return response.data.data;
}

export async function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  const response = await apiClient.post<Envelope<{ announcement: Announcement }>>("/announcements", input);
  return response.data.data.announcement;
}

export async function updateAnnouncement(id: number, input: AnnouncementInput & { revision: number }): Promise<Announcement> {
  const response = await apiClient.put<Envelope<{ announcement: Announcement }>>(`/announcements/${id}`, input);
  return response.data.data.announcement;
}

export async function publishAnnouncement(id: number, revision: number): Promise<Announcement> {
  const response = await apiClient.post<Envelope<{ announcement: Announcement }>>(`/announcements/${id}/publish`, { revision });
  return response.data.data.announcement;
}

export async function archiveAnnouncement(id: number): Promise<Announcement> {
  const response = await apiClient.post<Envelope<{ announcement: Announcement }>>(`/announcements/${id}/archive`);
  return response.data.data.announcement;
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await apiClient.delete(`/announcements/${id}`);
}
