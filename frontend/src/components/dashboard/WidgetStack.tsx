import { ChevronLeft, ChevronRight, Layers, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { StackPlacement } from "../../types/dashboardLayout";
import { cn } from "../../utils/cn";
import { smartOrder, type StackOrdering } from "./smartOrdering";
import { widgetById } from "./widgetCatalog";
import { WidgetFrame } from "./WidgetFrame";

/** Re-evaluate smart ordering at most this often, and only when the page is looked at again. */
const REEVALUATE_AFTER_MS = 10 * 60_000;

const titleOf = (id: string) => widgetById.get(id)?.title ?? id;

/**
 * One dashboard position showing several widgets, one at a time.
 *
 * With smart ordering on, the stack opens on the widget that matters now and
 * says why. It is evaluated when Home opens and again only when the page is
 * returned to after ten minutes, and never after the person has moved through
 * the stack themselves: their choice stands for the visit. Moving is always
 * available, by button or arrow key, and each change is announced.
 */
export default function WidgetStack({ stack }: { stack: StackPlacement }) {
  const manualKey = stack.widgets.join("|");
  const [ordering, setOrdering] = useState<StackOrdering | null>(null);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Editing the stack creates a new visit to that composition. In ordinary
  // use, however, a person's manual choice remains stable for the whole visit.
  useEffect(() => {
    setTouched(false);
    setIndex(0);
  }, [manualKey, stack.smart]);

  useEffect(() => {
    if (!stack.smart) {
      setOrdering(null);
      return;
    }
    // Once the person has cycled the stack, even an already-running relevance
    // request must not rearrange the widgets underneath their current choice.
    if (touched) return;
    let active = true;
    let evaluatedAt = 0;
    const widgets = manualKey.split("|");
    const evaluate = () => {
      evaluatedAt = Date.now();
      void smartOrder(widgets).then((result) => { if (active) setOrdering(result); });
    };
    evaluate();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - evaluatedAt > REEVALUATE_AFTER_MS) evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [manualKey, stack.smart, touched]);

  const order = useMemo(
    () => (stack.smart && ordering ? ordering.order : manualKey.split("|")),
    [stack.smart, ordering, manualKey],
  );
  const orderKey = order.join("|");

  // A new order starts at its first widget, unless the person is already browsing.
  useEffect(() => {
    if (!touched) setIndex(0);
  }, [orderKey, touched]);

  const position = Math.min(index, order.length - 1);
  const current = order[position]!;
  const reason = stack.smart && !touched ? ordering?.reasons[current] : undefined;
  const titles = order.map(titleOf);

  function go(delta: number) {
    const next = (position + delta + order.length) % order.length;
    setIndex(next);
    setTouched(true);
    setAnnouncement(`Showing ${titleOf(order[next]!)}, ${next + 1} of ${order.length}.`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      go(event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  const control = "grid size-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none pointer-coarse:size-10";

  return (
    <section
      aria-roledescription="widget stack"
      aria-label={`Widget stack: ${titles.join(", ")}`}
      className="flex h-full flex-col gap-1.5"
    >
      <div className="min-h-0 flex-1 [&>*]:h-full">
        <WidgetFrame key={current} id={current} size={stack.size} />
      </div>

      <div className="flex min-h-9 items-center justify-between gap-2 px-1" onKeyDown={onKeyDown}>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
          {reason ? (
            <>
              <Sparkles size={13} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate" title={reason}><span className="sr-only">Suggested now: </span>{reason}</span>
            </>
          ) : (
            <>
              <Layers size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <span className="truncate">{titleOf(current)}</span>
              {stack.smart && (
                <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary sm:inline-flex">
                  <Sparkles size={10} aria-hidden="true" />Smart
                </span>
              )}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={control} onClick={() => go(-1)} aria-label={`Previous widget in the stack (${position + 1} of ${order.length})`}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="flex items-center gap-1">
            {order.map((id, dot) => (
              <span key={id} className={cn("size-1.5 rounded-full", dot === position ? "bg-primary" : "bg-line-strong")} />
            ))}
          </span>
          <span className="text-[0.6875rem] tabular-nums text-fg-subtle">{position + 1} of {order.length}</span>
          <button type="button" className={control} onClick={() => go(1)} aria-label={`Next widget in the stack (${position + 1} of ${order.length})`}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
}
