import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { WidgetSize } from "../../types/dashboardLayout";
import { cn } from "../../utils/cn";
import Modal from "../ui/Modal";
import PrimaryButton from "../ui/PrimaryButton";
import { fieldClass } from "../ui/fieldStyles";
import { tintStyles } from "../ui/tint";
import { sizeLabels, widgetById, widgetsFor, type DashboardSubject, type WidgetMeta } from "./widgetCatalog";
import { WidgetFrame } from "./WidgetFrame";

/** The width each size is designed at; the preview is drawn at that width and scaled to fit. */
const previewWidths: Record<WidgetSize, number> = { small: 260, medium: 560, large: 1120 };

function preferredSize(meta: WidgetMeta): WidgetSize {
  return meta.sizes.includes("medium") ? "medium" : meta.sizes[0]!;
}

/**
 * The widget gallery: every widget this account may place, searchable and
 * grouped, with a live preview at the chosen size.
 *
 * The preview renders the real widget with the account's own data, so what it
 * shows is what Home will show; nothing is a sample. Widgets for data the
 * account cannot open are not listed at all. Loaded only when opened.
 */
export default function WidgetGallery({ subject, placed, full, onAdd, onClose }: {
  subject: DashboardSubject;
  placed: Set<string>;
  full: boolean;
  onAdd: (id: string, size: WidgetSize) => void;
  onClose: () => void;
}) {
  const isPhone = useMediaQuery("(max-width: 639px)");
  const searchRef = useRef<HTMLInputElement>(null);
  const available = useMemo(() => widgetsFor(subject), [subject]);
  const categories = useMemo(() => [...new Set(available.map((meta) => meta.category))], [available]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => available.find((meta) => !placed.has(meta.id))?.id ?? available[0]?.id ?? null);
  const [sizes, setSizes] = useState<Record<string, WidgetSize>>({});

  const term = query.trim().toLowerCase();
  const shown = available.filter((meta) =>
    (!category || meta.category === category) &&
    (!term || `${meta.title} ${meta.description} ${meta.category}`.toLowerCase().includes(term)));

  // The selection follows the filter, so the preview always describes a listed widget.
  useEffect(() => {
    if (shown.length > 0 && !shown.some((meta) => meta.id === selectedId)) setSelectedId(shown[0]!.id);
  }, [shown, selectedId]);

  const selected = selectedId ? widgetById.get(selectedId) ?? null : null;
  const listed = selected && shown.some((meta) => meta.id === selected.id) ? selected : null;
  const size = listed ? sizes[listed.id] ?? preferredSize(listed) : "medium";
  const onHome = listed ? placed.has(listed.id) : false;

  const previewBox = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(320);
  useEffect(() => {
    const box = previewBox.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setPreviewWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, previewWidth / previewWidths[size]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add a widget"
      description="Only widgets for information your account can already open are listed."
      size="xl"
      placement={isPhone ? "sheet" : undefined}
      initialFocusRef={searchRef}
    >
      <div className="space-y-4">
        <div className="relative">
          <label htmlFor="widget-search" className="sr-only">Search widgets</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          {/* A native input so the dialog can focus it on open; the shared field styling keeps it identical to TextInput. */}
          <input
            id="widget-search"
            ref={searchRef}
            type="search"
            className={fieldClass(false, "pl-9")}
            placeholder="Search widgets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>

        <div role="group" aria-label="Categories" className="flex flex-wrap gap-1.5">
          {[null, ...categories].map((entry) => (
            <button
              key={entry ?? "all"}
              type="button"
              aria-pressed={category === entry}
              onClick={() => setCategory(entry)}
              className={cn(
                "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none pointer-coarse:min-h-10",
                category === entry ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-muted hover:bg-surface-muted hover:text-fg",
              )}
            >
              {entry ?? "All"}
            </button>
          ))}
        </div>
        <p className="sr-only" role="status" aria-live="polite">{shown.length} {shown.length === 1 ? "widget" : "widgets"}</p>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <ul aria-label="Widgets" className="max-h-[22rem] space-y-1 overflow-y-auto pr-1 md:max-h-[28rem]">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-muted">No widgets match. Try another word or category.</li>}
            {shown.map((meta) => (
              <li key={meta.id}>
                <button
                  type="button"
                  aria-pressed={listed?.id === meta.id}
                  onClick={() => setSelectedId(meta.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                    listed?.id === meta.id ? "border-primary bg-primary-soft/60" : "border-transparent hover:bg-surface-muted",
                  )}
                >
                  <span aria-hidden="true" className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", tintStyles[meta.tint])}>
                    <meta.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{meta.title}</span>
                      {placed.has(meta.id) && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success-fg"><Check size={12} aria-hidden="true" />On Home</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-fg-subtle">{meta.description}</span>
                    <span className="mt-1.5 block text-[0.6875rem] font-medium uppercase tracking-wide text-fg-subtle">
                      {meta.category} · {meta.sizes.map((entry) => sizeLabels[entry]).join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-w-0 flex-col gap-3">
            <div ref={previewBox} className="overflow-hidden rounded-card border border-line bg-canvas p-3">
              <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wide text-fg-subtle">Preview</p>
              {!listed ? (
                <p className="py-10 text-center text-sm text-fg-muted">Choose a widget to preview it.</p>
              ) : onHome ? (
                <p className="py-10 text-center text-sm text-fg-muted">{listed.title} is already on your Home.</p>
              ) : (
                // Real data, drawn at the size's own width and scaled down. Not
                // interactive and hidden from assistive technology: it repeats
                // what the description and size choices already say.
                <div aria-hidden="true" inert className="pointer-events-none" style={{ width: previewWidths[size], zoom: scale }}>
                  <WidgetFrame id={listed.id} size={size} />
                </div>
              )}
            </div>

            {listed && (
              <>
                <div>
                  <h3 className="text-base font-semibold text-fg">{listed.title}</h3>
                  <p className="mt-0.5 text-sm text-fg-muted">{listed.description}</p>
                </div>
                <fieldset>
                  <legend className="text-xs font-medium text-fg-muted">Size</legend>
                  <div className="mt-1.5 inline-flex rounded-xl border border-control-border bg-surface p-0.5">
                    {listed.sizes.map((entry) => (
                      <label key={entry} className={cn(
                        "relative inline-flex min-h-8 cursor-pointer items-center rounded-[0.625rem] px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring pointer-coarse:min-h-10",
                        size === entry ? "bg-primary-soft text-primary" : "text-fg-muted hover:text-fg",
                      )}>
                        <input
                          type="radio"
                          name="widget-size"
                          value={entry}
                          checked={size === entry}
                          onChange={() => setSizes((current) => ({ ...current, [listed.id]: entry }))}
                          className="sr-only"
                        />
                        {sizeLabels[entry]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <PrimaryButton onClick={() => onAdd(listed.id, size)} disabled={onHome || full} className="self-start">
                  {onHome ? "Already on Home" : full ? "Home is full" : "Add to Home"}
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
