import { Component, Suspense, type ReactNode } from "react";
import type { WidgetSize } from "../../types/dashboardLayout";
import { widgetById } from "./widgetCatalog";
import { widgetComponents } from "./widgetRegistry";

/** A widget still downloading its code: the card's shape, announced once as busy. */
export function WidgetPlaceholder() {
  return (
    <div aria-busy="true" className="h-full min-h-[7.25rem] animate-pulse rounded-card border border-line bg-surface shadow-card motion-reduce:animate-none">
      <span className="sr-only">Loading widget</span>
    </div>
  );
}

/** One widget failing to render - a failed chunk download, say - never takes Home down with it. */
class WidgetBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="flex h-full flex-col justify-center rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-sm text-fg-muted">{this.props.title} could not be shown. Reload the page to try again.</p>
      </section>
    );
  }
}

/** Renders one catalog widget at a size, loading its code on first use. */
export function WidgetFrame({ id, size }: { id: string; size: WidgetSize }) {
  const Widget = widgetComponents[id];
  if (!Widget) return null;
  return (
    <WidgetBoundary title={widgetById.get(id)?.title ?? "This widget"}>
      <Suspense fallback={<WidgetPlaceholder />}>
        <Widget size={size} />
      </Suspense>
    </WidgetBoundary>
  );
}
