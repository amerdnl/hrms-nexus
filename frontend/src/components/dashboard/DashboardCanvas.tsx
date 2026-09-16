import {
  Check,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  GripVertical,
  Layers,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Scaling,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { DashboardItem, StackPlacement, WidgetSize } from "../../types/dashboardLayout";
import { cn } from "../../utils/cn";
import ConfirmationModal from "../common/ConfirmationModal";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Checkbox from "../ui/Checkbox";
import DropdownMenu, { type MenuItem } from "../ui/DropdownMenu";
import Modal from "../ui/Modal";
import PrimaryButton from "../ui/PrimaryButton";
import { tintStyles } from "../ui/tint";
import DashboardSkeleton from "./DashboardSkeleton";
import {
  addWidget,
  commonSizes,
  itemKey,
  itemTitle,
  MAX_ITEMS,
  MAX_STACK_WIDGETS,
  moveItem,
  moveWithinStack,
  placedWidgets,
  removeFromStack,
  removeItem,
  resizeItem,
  setStackSmart,
  stackCandidates,
  stackWith,
  unstack,
  widgetsIn,
} from "./layoutModel";
import type { DashboardHome } from "./useDashboardLayout";
import { sizeLabels, widgetById } from "./widgetCatalog";
import { WidgetFrame } from "./WidgetFrame";
import WidgetStack from "./WidgetStack";

const WidgetGallery = lazy(() => import("./WidgetGallery"));

/*
 * The grid: one deliberate column on a phone, two on a tablet, and four from
 * 1024 px. A small widget takes one column and one row, a medium two by two
 * from tablet widths, and a large the full width from 1024 px. Rows have a
 * minimum height and grow with content, so resizing never clips what a widget
 * has to say. Order is strict - no dense packing - so what you arrange is what
 * you get, on every screen and for a screen reader.
 */
const spans: Record<WidgetSize, string> = {
  small: "col-span-1 row-span-1",
  medium: "col-span-1 row-span-2 sm:col-span-2",
  large: "col-span-1 row-span-2 sm:col-span-2 lg:col-span-4",
};

const iconButton = "grid size-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none pointer-coarse:size-10";

const lower = (size: WidgetSize) => sizeLabels[size].toLowerCase();

/**
 * A personalised Home, and the editor for it.
 *
 * Editing works on a draft; nothing reaches the server until Done. Every change
 * can be made with a pointer, by touch and from the keyboard: drag a handle, or
 * focus it and press Space to pick the widget up, the arrow keys to move it and
 * Space to drop it (Escape puts it back); each widget's menu also moves,
 * resizes, stacks and removes it. Every change is announced.
 */
export default function DashboardCanvas({ home }: { home: DashboardHome }) {
  const helpId = useId();
  const layout = home.editing ? home.draft : home.saved;
  const items = useMemo(() => layout?.items ?? [], [layout]);
  const editing = home.editing;

  const [announcement, setAnnouncement] = useState("");
  const [drag, setDrag] = useState<{ from: number; over: number; pointerId: number } | null>(null);
  const [picked, setPicked] = useState<{ key: string; origin: number } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [stackTarget, setStackTarget] = useState<string | null>(null);
  const [stackEditor, setStackEditor] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);

  // A picked-up widget keeps focus as it moves through the grid.
  useEffect(() => {
    if (picked) handles.current.get(picked.key)?.focus();
  }, [picked, items]);

  // After adding or removing, focus lands somewhere sensible rather than on the page body.
  useEffect(() => {
    if (!pendingFocus) return;
    const target = pendingFocus === "add" ? addButton.current : handles.current.get(pendingFocus);
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
    setPendingFocus(null);
  }, [pendingFocus, items]);

  // Leaving edit mode ends any move in progress.
  useEffect(() => {
    if (!editing) {
      setPicked(null);
      setDrag(null);
    }
  }, [editing]);

  // A drag is followed on the window, not on the handle. The grid reorders
  // while dragging, which moves the handle's element, and moving an element
  // releases pointer capture - the drop would never arrive. The refs carry the
  // current order and move into these listeners without re-subscribing.
  const dragRef = useRef<typeof drag>(null);
  const orderRef = useRef<string[]>([]);
  const commitMoveRef = useRef<(from: number, to: number) => void>(() => undefined);
  // Keep the DOM order stable while dragging. Reflowing a mixed-size grid
  // under the pointer can move the target away and make the item oscillate
  // back to its origin. The target tile becomes the insertion placeholder;
  // the actual deterministic reflow happens once on drop.
  const shown = items;
  // Native window listeners do not receive a fresh React closure while the
  // pointer is moving. Keep the latest drag and visual order available to
  // them on every render, including after the dragged tile changes position.
  dragRef.current = drag;
  orderRef.current = shown.map(itemKey);
  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (event.clientY < 80) window.scrollBy({ top: -16 });
      else if (event.clientY > window.innerHeight - 80) window.scrollBy({ top: 16 });
      // Hit-test the tile physically under the pointer. Pointer capture and a
      // keyed React reorder can move the handle element itself, so event.target
      // is not a reliable drop target here.
      const tile = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-dashboard-key]");
      const key = tile?.dataset.dashboardKey;
      const position = key ? orderRef.current.indexOf(key) : -1;
      if (position >= 0 && position !== current.over) {
        const next = { ...current, over: position };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const onUp = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      dragRef.current = null;
      setDrag(null);
      if (current.from !== current.over) commitMoveRef.current(current.from, current.over);
    };
    const onCancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  if (!layout) return <DashboardSkeleton />;

  const update = (next: DashboardItem[]) => home.updateDraft({ version: 1, items: next });
  const draggingKey = drag ? itemKey(items[drag.from]!) : null;
  const dropTargetKey = drag ? itemKey(items[drag.over]!) : null;

  function move(index: number, to: number) {
    const title = itemTitle(items[index]!);
    if (to < 0 || to >= items.length) {
      setAnnouncement(`${title} is already ${to < 0 ? "first" : "last"}.`);
      return;
    }
    update(moveItem(items, index, to));
    setAnnouncement(`${title} moved to position ${to + 1} of ${items.length}.`);
  }
  commitMoveRef.current = move;

  function remove(index: number) {
    const item = items[index]!;
    const next = removeItem(items, index);
    update(next);
    setAnnouncement(`${itemTitle(item)} removed from Home.`);
    const neighbour = next[Math.min(index, next.length - 1)];
    setPendingFocus(neighbour ? itemKey(neighbour) : "add");
  }

  // ------------------------------------------------------------- pointer drag

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    setPicked(null);
    const next = { from: index, over: index, pointerId: event.pointerId };
    dragRef.current = next;
    setDrag(next);
  }

  // ------------------------------------------------------------ keyboard move

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const item = items[index]!;
    const key = itemKey(item);
    const title = itemTitle(item);

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (picked?.key === key) {
        setPicked(null);
        setAnnouncement(`${title} dropped at position ${index + 1} of ${items.length}.`);
      } else {
        setPicked({ key, origin: index });
        setAnnouncement(`${title} picked up at position ${index + 1} of ${items.length}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`);
      }
      return;
    }
    if (picked?.key !== key) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      update(moveItem(items, index, picked.origin));
      setPicked(null);
      setAnnouncement(`Move cancelled. ${title} is back at position ${picked.origin + 1}.`);
      return;
    }
    const delta = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1
      : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (delta !== 0) {
      event.preventDefault();
      move(index, index + delta);
    }
  }

  // ------------------------------------------------------------------ controls

  function controls(item: DashboardItem, index: number) {
    const key = itemKey(item);
    const title = itemTitle(item);
    const sizes = commonSizes(widgetsIn(item));
    const candidates = stackCandidates(items, index);
    const resize = (size: WidgetSize) => {
      update(resizeItem(items, index, size));
      setAnnouncement(`${title} is now ${lower(size)}.`);
    };

    const menu: MenuItem[] = [
      { key: "earlier", label: "Move earlier", icon: <ChevronUp size={16} aria-hidden="true" />, disabled: index === 0, onSelect: () => move(index, index - 1) },
      { key: "later", label: "Move later", icon: <ChevronDown size={16} aria-hidden="true" />, disabled: index === items.length - 1, onSelect: () => move(index, index + 1) },
      ...(item.kind === "stack"
        ? [
            { key: "edit-stack", label: "Edit stack…", icon: <Layers size={16} aria-hidden="true" />, onSelect: () => setStackEditor(item.id) },
            {
              key: "unstack", label: "Unstack", icon: <Layers size={16} aria-hidden="true" />,
              onSelect: () => {
                update(unstack(items, index));
                setAnnouncement(`Unstacked. Its ${item.widgets.length} widgets are back on Home.`);
                setPendingFocus(item.widgets[0]!);
              },
            },
          ]
        : [{ key: "stack", label: "Stack with another widget…", icon: <Layers size={16} aria-hidden="true" />, disabled: candidates.length === 0, onSelect: () => setStackTarget(key) }]),
      ...sizes.map((size) => ({ key: `size-${size}`, label: sizeLabels[size], group: "Size", checked: size === item.size, onSelect: () => resize(size) })),
      { key: "remove", label: "Remove from Home", icon: <X size={16} aria-hidden="true" />, tone: "danger" as const, onSelect: () => remove(index) },
    ];

    return (
      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full border border-line bg-elevated/95 p-0.5 shadow-raised backdrop-blur">
        <button
          ref={(element) => { if (element) handles.current.set(key, element); else handles.current.delete(key); }}
          type="button"
          aria-label={`Move ${title}, position ${index + 1} of ${items.length}`}
          aria-describedby={helpId}
          aria-pressed={picked?.key === key}
          onPointerDown={(event) => onPointerDown(event, index)}
          onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
          onKeyDown={(event) => onHandleKeyDown(event, index)}
          className={cn(iconButton, "cursor-grab touch-none active:cursor-grabbing", picked?.key === key && "bg-primary-soft text-primary")}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        {sizes.length > 1 && (
          <span className="max-sm:hidden">
            <DropdownMenu
              unstyled
              label={`Size of ${title}: ${sizeLabels[item.size]}`}
              className={iconButton}
              align="end"
              trigger={<Scaling size={15} aria-hidden="true" />}
              items={sizes.map((size) => ({ key: size, label: sizeLabels[size], checked: size === item.size, onSelect: () => resize(size) }))}
            />
          </span>
        )}
        <DropdownMenu
          unstyled
          label={`More options for ${title}`}
          className={iconButton}
          align="end"
          trigger={<Ellipsis size={16} aria-hidden="true" />}
          items={menu}
        />
        <button type="button" aria-label={`Remove ${title}`} onClick={() => remove(index)} className={cn(iconButton, "max-sm:hidden")}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const placed = placedWidgets(items);
  const targetIndex = stackTarget ? items.findIndex((item) => itemKey(item) === stackTarget) : -1;
  const editorIndex = stackEditor ? items.findIndex((item) => item.kind === "stack" && item.id === stackEditor) : -1;
  const editorStack = editorIndex >= 0 ? (items[editorIndex] as StackPlacement) : null;

  return (
    <div>
      {editing && (
        // Just below the sticky header at each of its heights (64, 80 and 83 px).
        <div className="sticky top-[4.5rem] z-20 mb-4 rounded-card border border-line bg-elevated/95 p-3 shadow-raised backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-4 md:top-[5.5rem] min-[80rem]:top-[5.75rem]">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <LayoutDashboard size={16} className="text-primary" aria-hidden="true" />
              Editing Home
            </h2>
            <p id={helpId} className="mt-0.5 text-xs text-fg-subtle">
              Drag a handle, or focus it and press Space then the arrow keys. Nothing is saved until Done.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0 sm:items-center">
            <Button ref={addButton} variant="secondary" size="sm" icon={Plus} className="max-sm:min-h-11" onClick={() => setGalleryOpen(true)} disabled={items.length >= MAX_ITEMS}>
              Add widget
            </Button>
            <Button variant="ghost" size="sm" icon={RotateCcw} className="max-sm:min-h-11" onClick={() => setConfirmReset(true)} disabled={home.saving}>
              Reset to default
            </Button>
            <Button variant="ghost" size="sm" className="max-sm:min-h-11" onClick={home.cancelEditing} disabled={home.saving}>
              Cancel
            </Button>
            <PrimaryButton size="sm" icon={Check} className="max-sm:min-h-11" onClick={() => void home.save()} isLoading={home.saving} loadingLabel="Saving...">
              Done
            </PrimaryButton>
          </div>
        </div>
      )}

      {home.error && <Alert tone="danger" className="mb-4" onDismiss={home.clearError}>{home.error}</Alert>}

      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
          <LayoutDashboard size={22} className="mx-auto text-fg-subtle" aria-hidden="true" />
          <p className="mt-3 font-semibold text-fg">Home has no widgets</p>
          <p className="mt-1 text-sm text-fg-muted">
            {editing ? "Add widgets to build your Home, or reset it to the default." : "Choose Edit dashboard to add widgets or reset to the default."}
          </p>
          {editing && <Button className="mt-4" variant="secondary" icon={Plus} onClick={() => setGalleryOpen(true)}>Add widget</Button>}
        </div>
      ) : (
        <ul
          aria-label={editing ? "Home widgets, being edited" : "Home widgets"}
          className="grid grid-cols-1 gap-3 [grid-auto-rows:minmax(7.25rem,auto)] sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 min-[80rem]:gap-3"
        >
          {shown.map((item) => {
            const key = itemKey(item);
            const isDragged = key === draggingKey;
            const isDropTarget = key === dropTargetKey;
            return (
              <li
                key={key}
                data-dashboard-key={key}
                className={cn(
                  spans[item.size],
                  "relative min-w-0",
                  editing && "rounded-card outline-1 outline-offset-4 outline-line-strong",
                  isDropTarget && "rounded-card outline-2 outline-dashed outline-primary",
                  picked?.key === key && "rounded-card outline-2 outline-primary",
                )}
              >
                {/* While editing, a widget is a preview: not clickable, not in the tab order. */}
                <div className={cn("h-full", editing && "pointer-events-none select-none", isDragged && "opacity-35")} inert={editing || undefined}>
                  {item.kind === "widget" ? <WidgetFrame id={item.widget} size={item.size} /> : <WidgetStack stack={item} />}
                </div>
                {editing && controls(item, items.findIndex((entry) => itemKey(entry) === key))}
              </li>
            );
          })}
        </ul>
      )}

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {galleryOpen && (
        <Suspense fallback={null}>
          <WidgetGallery
            subject={home.subject}
            placed={placed}
            full={items.length >= MAX_ITEMS}
            onClose={() => { setGalleryOpen(false); setPendingFocus("add"); }}
            onAdd={(id, size) => {
              update(addWidget(items, id, size));
              setGalleryOpen(false);
              setAnnouncement(`${widgetById.get(id)?.title ?? id} added at the end of Home, ${lower(size)}.`);
              setPendingFocus(id);
            }}
          />
        </Suspense>
      )}

      {targetIndex >= 0 && (
        <Modal
          isOpen
          onClose={() => setStackTarget(null)}
          title={`Stack with ${itemTitle(items[targetIndex]!)}`}
          description="A stack shows several widgets in one place, one at a time. Only widgets that share a size can be stacked."
          icon={<Layers size={20} />}
        >
          <ul className="space-y-1">
            {stackCandidates(items, targetIndex).map((id) => {
              const meta = widgetById.get(id)!;
              const shared = commonSizes([...widgetsIn(items[targetIndex]!), id]);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      update(stackWith(items, targetIndex, id));
                      setAnnouncement(`${meta.title} stacked with ${itemTitle(items[targetIndex]!)}.`);
                      setStackTarget(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tintStyles[meta.tint])}><meta.icon size={17} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{meta.title}</span>
                      <span className="block text-xs text-fg-subtle">Both come in {shared.map(lower).join(" and ")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      {editorStack && (
        <Modal
          isOpen
          onClose={() => setStackEditor(null)}
          title="Edit stack"
          description={`${editorStack.widgets.length} widgets in one place, shown one at a time at ${lower(editorStack.size)} size.`}
          icon={<Layers size={20} />}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  update(unstack(items, editorIndex));
                  setAnnouncement(`Unstacked. Its ${editorStack.widgets.length} widgets are back on Home.`);
                  setStackEditor(null);
                }}
              >
                Unstack
              </Button>
              <PrimaryButton onClick={() => setStackEditor(null)}>Done</PrimaryButton>
            </>
          }
        >
          <div className="space-y-5">
            <ol aria-label="Widgets in this stack" className="divide-y divide-line rounded-xl border border-line">
              {editorStack.widgets.map((id, position) => {
                const meta = widgetById.get(id)!;
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-2">
                    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tintStyles[meta.tint])}><meta.icon size={15} /></span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-fg">{meta.title}</span>
                    <button type="button" className={iconButton} aria-label={`Move ${meta.title} up in the stack`} disabled={position === 0}
                      onClick={() => { update(moveWithinStack(items, editorIndex, position, position - 1)); setAnnouncement(`${meta.title} is now ${position} in the stack.`); }}>
                      <ChevronUp size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={iconButton} aria-label={`Move ${meta.title} down in the stack`} disabled={position === editorStack.widgets.length - 1}
                      onClick={() => { update(moveWithinStack(items, editorIndex, position, position + 1)); setAnnouncement(`${meta.title} is now ${position + 2} in the stack.`); }}>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={iconButton} aria-label={`Take ${meta.title} out of the stack`}
                      onClick={() => { update(removeFromStack(items, editorIndex, id)); setAnnouncement(`${meta.title} taken out of the stack and placed after it.`); }}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>

            {editorStack.widgets.length < MAX_STACK_WIDGETS && stackCandidates(items, editorIndex).length > 0 && (
              <div>
                <p className="text-xs font-medium text-fg-muted">Add a widget from Home</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {stackCandidates(items, editorIndex).map((id) => (
                    <Button key={id} variant="secondary" size="sm" icon={Plus}
                      onClick={() => { update(stackWith(items, editorIndex, id)); setAnnouncement(`${widgetById.get(id)!.title} added to the stack.`); }}>
                      {widgetById.get(id)!.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Checkbox
              label="Smart ordering"
              description="Opens the stack on the widget that matters now - tasks that are due, leave to decide, a payslip just paid, or checking in as the working day starts - using your own HR Nexus information and the company clock. Off, the order above is always kept."
              checked={editorStack.smart}
              onChange={(event) => {
                update(setStackSmart(items, editorIndex, event.target.checked));
                setAnnouncement(`Smart ordering ${event.target.checked ? "on" : "off"}.`);
              }}
            />
          </div>
        </Modal>
      )}

      <ConfirmationModal
        isOpen={confirmReset}
        isProcessing={home.saving}
        title="Reset Home to the default?"
        description="Your widgets, sizes and stacks are removed, and Home shows the standard layout for your role again. Only your account is affected."
        confirmLabel="Reset to default"
        processingLabel="Resetting..."
        icon={<RotateCcw size={21} />}
        tone="primary"
        onCancel={() => { if (!home.saving) setConfirmReset(false); }}
        onConfirm={() => { void home.reset().then(() => setConfirmReset(false)); }}
      />
    </div>
  );
}
