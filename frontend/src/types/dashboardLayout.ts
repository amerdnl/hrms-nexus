/** How much of the dashboard grid a widget or stack takes. */
export type WidgetSize = "small" | "medium" | "large";

export interface WidgetPlacement {
  kind: "widget";
  widget: string;
  size: WidgetSize;
}

/** One dashboard position holding several compatible widgets, shown one at a time. */
export interface StackPlacement {
  kind: "stack";
  id: string;
  size: WidgetSize;
  widgets: string[];
  /** Brings forward the widget that matters now; manual order otherwise. */
  smart: boolean;
}

export type DashboardItem = WidgetPlacement | StackPlacement;

/** Presentation only. Never a permission: the server re-checks every widget. */
export interface DashboardLayout {
  version: 1;
  items: DashboardItem[];
}

export interface DashboardLayoutState {
  /** False where the installation has not applied migration 0017 yet. */
  available: boolean;
  /** Null means the approved default Home. */
  layout: DashboardLayout | null;
  revision: number | null;
  updatedAt: string | null;
}
