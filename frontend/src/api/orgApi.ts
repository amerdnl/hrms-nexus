import apiClient from "./axios";

/**
 * Maintaining the organisation chart. Administrators only - the server enforces
 * that, and hiding the buttons is a convenience rather than the protection.
 */

export interface PositionPayload {
  title: string;
  departmentId: number | null;
  positionKind: "staff" | "vacant" | "external";
  occupancy: "vacant" | "filled" | "filled_unnamed";
  occupantName: string | null;
  managerId: number | null;
  additionalManagerIds: number[];
  notes: string | null;
}

export async function createPosition(payload: PositionPayload): Promise<number> {
  const response = await apiClient.post<{ data: { id: number } }>("/org/positions", payload);
  return response.data.data.id;
}

export async function updatePosition(id: number, payload: PositionPayload): Promise<void> {
  await apiClient.patch(`/org/positions/${id}`, payload);
}

/** Takes a position off the chart without destroying the record behind it. */
export async function archivePosition(id: number): Promise<void> {
  await apiClient.delete(`/org/positions/${id}`);
}

/** Where the cards and panels sit. Layout only: it moves nothing structural. */
export async function saveLayout(
  positions: Array<{ id: number; x: number; y: number }>,
  notes: Array<{ id: number; x: number; y: number }> = [],
): Promise<void> {
  await apiClient.put("/org/layout", { positions, notes });
}

export type RelationshipKind = "primary" | "additional";

export async function createRelationship(input: {
  childId: number;
  parentId: number;
  kind: RelationshipKind;
  confidence: "confirmed" | "unconfirmed";
}): Promise<void> {
  await apiClient.post("/org/relationships", input);
}

export async function removeRelationship(childId: number, parentId: number): Promise<void> {
  await apiClient.delete(`/org/relationships/${childId}/${parentId}`);
}

export async function createNote(input: { label: string; body: string | null; x: number; y: number }): Promise<number> {
  const response = await apiClient.post<{ data: { id: number } }>("/org/notes", input);
  return response.data.data.id;
}

export async function updateNote(id: number, input: { label: string; body: string | null }): Promise<void> {
  await apiClient.patch(`/org/notes/${id}`, input);
}

export async function deleteNote(id: number): Promise<void> {
  await apiClient.delete(`/org/notes/${id}`);
}
