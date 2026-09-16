import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getDashboardLayout, resetDashboardLayout, saveDashboardLayout } from "../../api/dashboardLayoutApi";
import { useAuth } from "../../context/useAuth";
import type { DashboardLayout } from "../../types/dashboardLayout";
import { claimDashboardData } from "./dashboardData";
import { defaultLayoutFor, layoutsEqual, sanitizeLayout } from "./layoutModel";
import type { DashboardSubject } from "./widgetCatalog";

export type LayoutStatus = "loading" | "ready" | "unavailable" | "failed";

export interface DashboardHome {
  subject: DashboardSubject;
  status: LayoutStatus;
  /** The saved layout, filtered to this session; null is the approved default Home. */
  saved: DashboardLayout | null;
  editing: boolean;
  draft: DashboardLayout | null;
  /** Whether Home renders the widget grid instead of the default page. */
  showCustom: boolean;
  canEdit: boolean;
  saving: boolean;
  error: string;
  startEditing: () => void;
  cancelEditing: () => void;
  updateDraft: (layout: DashboardLayout) => void;
  save: () => Promise<boolean>;
  reset: () => Promise<boolean>;
  clearError: () => void;
}

/**
 * Remembers, per account and browser, whether Home was last personalised, so a
 * personalised Home does not flash the default while the server answers. Only a
 * hint: the server's layout always wins once it arrives.
 */
const hintKey = (userId: number) => `hr_nexus_home_layout:${userId}`;
const readHint = (userId: number) => {
  try { return localStorage.getItem(hintKey(userId)) === "custom"; } catch { return false; }
};
const writeHint = (userId: number, custom: boolean) => {
  try { localStorage.setItem(hintKey(userId), custom ? "custom" : "default"); } catch { /* a hint only */ }
};

/**
 * The account's Home layout: loads it, edits a draft, saves on Done and resets
 * to the default. With nothing saved - or where personalization is not
 * available - Home is exactly the default page.
 */
export function useDashboardLayout(): DashboardHome {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const subject = useMemo<DashboardSubject>(() => ({
    role: user?.role === "admin" ? "admin" : "employee",
    isManager: Boolean(user?.isManager),
    employeeId: user?.employeeId ?? null,
  }), [user?.role, user?.isManager, user?.employeeId]);

  const [status, setStatus] = useState<LayoutStatus>("loading");
  const [saved, setSaved] = useState<DashboardLayout | null>(null);
  const [hintCustom, setHintCustom] = useState(() => (userId ? readHint(userId) : false));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    claimDashboardData(userId);
    let active = true;
    getDashboardLayout()
      .then((state) => {
        if (!active) return;
        if (!state.available) {
          setStatus("unavailable");
          setSaved(null);
          writeHint(userId, false);
          setHintCustom(false);
          return;
        }
        const layout = state.layout ? sanitizeLayout(state.layout, subject) : null;
        setSaved(layout);
        setStatus("ready");
        writeHint(userId, layout !== null);
        setHintCustom(layout !== null);
      })
      .catch(() => {
        if (!active) return;
        // Never leave Home blank: without an answer the default page is shown.
        setStatus("failed");
        setHintCustom(false);
      });
    return () => { active = false; };
  }, [userId, subject]);

  const startEditing = useCallback(() => {
    setError("");
    setDraft(saved ?? defaultLayoutFor(subject));
    setEditing(true);
  }, [saved, subject]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setDraft(null);
    setError("");
  }, []);

  const save = useCallback(async () => {
    if (!draft) return false;
    const baseline = saved ?? defaultLayoutFor(subject);
    // Nothing changed: an untouched default stays the default page, unsaved.
    if (layoutsEqual(draft, baseline)) {
      cancelEditing();
      return true;
    }
    setSaving(true);
    setError("");
    try {
      const state = await saveDashboardLayout(draft);
      const layout = state.layout ? sanitizeLayout(state.layout, subject) : null;
      setSaved(layout);
      writeHint(userId, layout !== null);
      setHintCustom(layout !== null);
      setEditing(false);
      setDraft(null);
      return true;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Your Home layout could not be saved. Your changes are still here."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, saved, subject, userId, cancelEditing]);

  const reset = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await resetDashboardLayout();
      setSaved(null);
      writeHint(userId, false);
      setHintCustom(false);
      setEditing(false);
      setDraft(null);
      return true;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Home could not be reset. Try again."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [userId]);

  return {
    subject,
    status,
    saved,
    editing,
    draft,
    showCustom: editing || saved !== null || (status === "loading" && hintCustom),
    canEdit: status === "ready",
    saving,
    error,
    startEditing,
    cancelEditing,
    updateDraft: setDraft,
    save,
    reset,
    clearError: () => setError(""),
  };
}
