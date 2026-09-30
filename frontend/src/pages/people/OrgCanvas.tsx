import { Building2, GripVertical, Link2, MoreHorizontal, UserRoundX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import Avatar from "../../components/ui/Avatar";
import type { OrgLayoutBox, OrgNode, OrgSourceLink, OrgSourceNote } from "../../types/people";
import { cn } from "../../utils/cn";

/**
 * The organisation chart as a laid-out set of cards.
 *
 * ONE FIXED SCALE, ALWAYS. There is no zoom and nothing is scaled to fit: a
 * chart shrunk until it fits is a chart nobody can read, and reading it is the
 * whole job. A real organisation is wider than a screen, and the honest answer
 * to that is a scrollbar - so the canvas scrolls sideways natively, the page
 * scrolls vertically as any page does, and dragging empty space scrolls it too
 * for anyone without a horizontal wheel.
 *
 * LAYOUT IS NOT STRUCTURE. Dragging a card moves the card. Who reports to whom
 * changes only through the position editor or by drawing a line on purpose, and
 * both say so before they save. An administrator tidying the chart must never
 * discover afterwards that they reassigned somebody.
 */

/** Pixels per layout unit. Fixed, so a card is always the same readable size. */
const SCALE = 210;
/** Every card is one height, which keeps every connector anchor computable. */
const CARD_UNITS = 0.6;
const GUTTER = 0.11 * SCALE;
const BUS = 0.1 * SCALE;
const PAD = 0.4 * SCALE;
/** Dragging is a drag, not a click, once it passes this many pixels. */
const DRAG_SLOP = 4;
/**
 * An A3 landscape sheet at 96dpi, less its margins and the heading above the
 * chart. Paper cannot scroll, so this is the one place the chart is scaled to
 * fit - and A3, because a company's chart on A4 is either unreadable or cut
 * into pieces.
 */
const SHEET = { width: 420 * (96 / 25.4) - 76, height: 297 * (96 / 25.4) - 76 - 205 };

interface Box { left: number; top: number; width: number; height: number; cx: number; cy: number; right: number; bottom: number }
interface Wire { id: string; childId: number; parentId: number; points: Array<[number, number]>; dashed: boolean; extra: boolean }

const boxOf = (item: { x: number; y: number; width: number }): Box => {
  const left = item.x * SCALE;
  const top = item.y * SCALE;
  const width = item.width * SCALE;
  const height = CARD_UNITS * SCALE;
  return { left, top, width, height, cx: left + width / 2, cy: top + height / 2, right: left + width, bottom: top + height };
};

/**
 * Routes one connector: straight down a column when the way is clear, out into
 * the gutter beside it when a card is in the way, and along a run below the
 * manager when the two sit in different columns. Orthogonal throughout, because
 * diagonals across a chart of thirty cards are unreadable.
 */
function route(child: Box, parent: Box, others: Box[], canvasCx: number): Array<[number, number]> {
  const sameColumn = Math.abs(child.cx - parent.cx) < child.width / 2;
  if (sameColumn) {
    const blocked = others.some(
      (other) =>
        Math.abs(other.cx - child.cx) < child.width / 2 &&
        other.top > Math.min(parent.bottom, child.bottom) - 1 &&
        other.bottom < Math.max(parent.top, child.top) + 1,
    );
    if (!blocked) return [[child.cx, child.top], [child.cx, parent.bottom]];
    // Out beside the column, the way a bracket runs down a stack of boxes. The
    // several lines from one card to its team share this gutter, which is what
    // makes "reports to all three" read as one relationship rather than three.
    const x = child.cx < canvasCx ? child.left - GUTTER : child.right + GUTTER;
    return [
      [child.cx < canvasCx ? child.left : child.right, child.cy],
      [x, child.cy],
      [x, parent.cy],
      [child.cx < canvasCx ? parent.left : parent.right, parent.cy],
    ];
  }
  if (Math.abs(child.cy - parent.cy) < child.height) {
    return child.cx > parent.cx
      ? [[child.left, child.cy], [parent.right, parent.cy]]
      : [[child.right, child.cy], [parent.left, parent.cy]];
  }
  const parentIsRight = parent.cx > child.cx;
  const gutterX = parentIsRight ? child.right + GUTTER : child.left - GUTTER;
  const busY = parent.bottom + BUS;
  return [
    [parentIsRight ? child.right : child.left, child.cy],
    [gutterX, child.cy],
    [gutterX, busY],
    [parent.cx, busY],
    [parent.cx, parent.bottom],
  ];
}

const pointsOf = (points: Array<[number, number]>) => points.map(([x, y]) => `${x},${y}`).join(" ");

export interface CanvasHandlers {
  onMove: (moves: Array<{ id: number; x: number; y: number }>, notes: Array<{ id: number; x: number; y: number }>) => void;
  onEditPosition: (node: OrgNode) => void;
  onAddReport: (manager: OrgNode) => void;
  onEditNote: (note: OrgSourceNote) => void;
  onConnect: (childId: number, parentId: number) => void;
  onSelectWire: (childId: number, parentId: number) => void;
}

interface Props {
  nodes: OrgNode[];
  layout: OrgLayoutBox[];
  links: OrgSourceLink[];
  notes: OrgSourceNote[];
  editing: boolean;
  highlight: number | null;
  handlers: CanvasHandlers;
}

export default function OrgCanvas({ nodes, layout, links, notes, editing, highlight, handlers }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<number, HTMLDivElement>());
  /** Positions being dragged, before they are saved. */
  const [drafts, setDrafts] = useState<Record<string, { x: number; y: number }>>({});
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [connectFrom, setConnectFrom] = useState<number | null>(null);

  const place = (key: string, fallback: { x: number; y: number }) => drafts[key] ?? fallback;

  const { boxes, noteBoxes, wires, divider, canvas } = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const placed = layout.filter((item) => byId.has(item.id));
    const boxes = new Map(
      placed.map((item) => {
        const at = place(`p${item.id}`, { x: item.x, y: item.y });
        return [item.id, boxOf({ ...item, ...at })];
      }),
    );
    const noteBoxes = notes.map((note) => {
      const at = place(`n${note.id}`, { x: note.x, y: note.y });
      return { note, box: boxOf({ x: at.x, y: at.y, width: note.width }) };
    });

    const all = [...boxes.values()];
    const width = Math.max(...all.map((b) => b.right), ...noteBoxes.map((n) => n.box.right), 0) + PAD;
    const height = Math.max(...all.map((b) => b.bottom), ...noteBoxes.map((n) => n.box.bottom), 0) + PAD;
    const canvasCx = width / 2;

    const wires: Wire[] = [];
    const draw = (childId: number, parentId: number, dashed: boolean, extra: boolean) => {
      const child = boxes.get(childId);
      const parent = boxes.get(parentId);
      if (!child || !parent) return;
      wires.push({
        id: `${extra ? "x" : "m"}-${childId}-${parentId}`,
        childId,
        parentId,
        points: route(child, parent, all.filter((b) => b !== child && b !== parent), canvasCx),
        dashed,
        extra,
      });
    };
    for (const node of nodes) {
      if (node.managerId !== null) draw(node.id, node.managerId, node.reportingLineConfidence === "unconfirmed", false);
    }
    for (const link of links) draw(link.childId, link.parentId, link.confidence === "unconfirmed", true);

    // Where the company's own people end and outside parties begin.
    const internal = placed.filter((item) => byId.get(item.id)!.positionKind !== "external");
    const external = placed.filter((item) => byId.get(item.id)!.positionKind === "external");
    let divider: number | null = null;
    if (internal.length > 0 && external.length > 0) {
      const lastInternal = Math.max(...internal.map((item) => boxes.get(item.id)!.bottom));
      const firstExternal = Math.min(...external.map((item) => boxes.get(item.id)!.top));
      if (firstExternal > lastInternal) divider = (lastInternal + firstExternal) / 2;
    }
    return { boxes, noteBoxes, wires, divider, canvas: { width: Math.max(width, 1), height: Math.max(height, 1) } };
  }, [nodes, layout, links, notes, drafts]);

  // Search brings a card into view by scrolling, never by scaling.
  useEffect(() => {
    if (highlight === null) return;
    const card = cards.current.get(highlight);
    if (!card) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ block: "center", inline: "center", behavior: smooth ? "smooth" : "auto" });
  }, [highlight]);

  useEffect(() => { if (!editing) { setMenuFor(null); setConnectFrom(null); } }, [editing]);

  // ------------------------------------------------------- dragging the sheet
  const [panning, setPanning] = useState(false);
  const onBackgroundDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest?.("[data-card],[data-note],a,button")) return;
    const frame = viewport.current;
    if (!frame) return;
    const startX = event.clientX;
    const startScroll = frame.scrollLeft;
    setPanning(true);
    // Listeners on the window rather than pointer capture on the box: capture
    // redirects events to the captor, and a scroll container that is also
    // receiving captured moves does not reliably see them. The window always
    // does, including when the pointer leaves the chart mid-drag.
    const move = (moveEvent: PointerEvent) => {
      // Horizontal only. Vertical stays the page's own scrolling, which is what
      // everyone's fingers already expect.
      frame.scrollLeft = startScroll - (moveEvent.clientX - startX);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setPanning(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  // -------------------------------------------------------- dragging a card
  const drag = useRef<{ key: string; id: number; isNote: boolean; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  const startDrag = (event: React.PointerEvent, key: string, id: number, isNote: boolean, origin: { x: number; y: number }) => {
    if (!editing) return;
    event.stopPropagation();
    drag.current = {
      key, id, isNote,
      startX: event.clientX, startY: event.clientY,
      originX: origin.x, originY: origin.y,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    state.moved = true;
    // Snapped to a twentieth of a unit, so a tidy chart stays tidy without
    // anyone lining cards up by eye.
    const snap = (value: number) => Math.round(value * 20) / 20;
    setDrafts((current) => ({
      ...current,
      [state.key]: { x: Math.max(0, snap(state.originX + dx / SCALE)), y: Math.max(0, snap(state.originY + dy / SCALE)) },
    }));
  };
  const endDrag = () => {
    const state = drag.current;
    drag.current = null;
    if (!state?.moved) return;
    const at = drafts[state.key];
    if (!at) return;
    handlers.onMove(
      state.isNote ? [] : [{ id: state.id, x: at.x, y: at.y }],
      state.isNote ? [{ id: state.id, x: at.x, y: at.y }] : [],
    );
  };
  /** True while a drag has actually moved, so the release is not a click. */
  const swallowClick = () => drag.current?.moved === true;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const printScale = Math.min(SHEET.width / canvas.width, SHEET.height / canvas.height, 1);

  const beginConnect = (id: number) => {
    if (connectFrom === null) { setConnectFrom(id); setMenuFor(null); return; }
    if (connectFrom === id) { setConnectFrom(null); return; }
    handlers.onConnect(connectFrom, id);
    setConnectFrom(null);
  };

  return (
    <div className="relative">
      {editing && (
        <p className="mb-2 rounded-card border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted print:hidden">
          {connectFrom === null
            ? "Drag a card to move it. Use ⋯ on a card to edit it, add a direct report, or start a reporting line. Click a line to change or remove it."
            : `Now click the position that ${byId.get(connectFrom)?.fullName ?? "this position"} should report to. Click the same card again to cancel.`}
        </p>
      )}

      <div
        ref={viewport}
        data-chart-viewport
        onPointerDown={onBackgroundDown}
        style={{
          "--print-scale": printScale,
          "--print-height": `${Math.ceil(canvas.height * printScale)}px`,
        } as React.CSSProperties}
        className={cn(
          "relative overflow-x-auto rounded-card border border-line bg-canvas shadow-card",
          "[background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:1.25rem_1.25rem]",
          panning ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div data-chart-canvas className="relative origin-top-left" style={{ width: canvas.width, height: canvas.height }}>
          <svg width={canvas.width} height={canvas.height} className="absolute left-0 top-0">
            {divider !== null && (
              <line
                x1={0} y1={divider} x2={canvas.width} y2={divider}
                stroke="var(--line-strong)" strokeWidth={1.5} strokeDasharray="10 7"
              />
            )}
            {wires.map((wire) => (
              <g key={wire.id}>
                <polyline
                  points={pointsOf(wire.points)}
                  fill="none"
                  stroke={wire.dashed ? "var(--warning-fg)" : "var(--control-border)"}
                  strokeWidth={wire.dashed ? 1.75 : 1.5}
                  strokeDasharray={wire.dashed ? "6 5" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {editing && (
                  // A fat invisible line over the thin visible one, so a
                  // reporting line can actually be clicked.
                  <polyline
                    points={pointsOf(wire.points)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    onClick={() => handlers.onSelectWire(wire.childId, wire.parentId)}
                  />
                )}
              </g>
            ))}
          </svg>

          {noteBoxes.map(({ note, box }) => (
            <div
              key={`note-${note.id}`}
              data-note
              onPointerDown={(event) => startDrag(event, `n${note.id}`, note.id, true, place(`n${note.id}`, { x: note.x, y: note.y }))}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onClick={() => { if (!swallowClick() && editing) handlers.onEditNote(note); }}
              className={cn(
                "absolute rounded-lg border border-dashed border-line bg-surface-muted/70 px-3 py-2",
                editing && "cursor-move hover:border-primary",
              )}
              style={{ left: box.left, top: box.top, width: box.width }}
            >
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-fg-muted">{note.label}</p>
              {note.body && <p className="mt-1 whitespace-pre-line text-[0.6875rem] leading-tight text-fg-subtle">{note.body}</p>}
            </div>
          ))}

          {[...boxes.entries()].map(([id, box]) => {
            const node = byId.get(id);
            if (!node) return null;
            const staff = node.positionKind === "staff";
            const filled = node.occupancy === "filled" || node.occupancy === "filled_unnamed" || staff;
            return (
              <div
                key={id}
                data-card
                ref={(element) => { if (element) cards.current.set(id, element); else cards.current.delete(id); }}
                onPointerDown={(event) => startDrag(event, `p${id}`, id, false, { x: box.left / SCALE, y: box.top / SCALE })}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onClick={() => { if (!swallowClick() && connectFrom !== null) beginConnect(id); }}
                className={cn(
                  "absolute flex flex-col justify-center rounded-xl border bg-surface px-3.5 py-3 text-left shadow-card transition-colors",
                  node.positionKind === "vacant" && !filled && "border-dashed bg-surface-muted",
                  node.positionKind === "external" && "border-line bg-surface-muted/60",
                  highlight === id ? "border-primary ring-2 ring-primary-soft" : "border-line",
                  connectFrom === id && "border-primary ring-2 ring-primary",
                  editing && "cursor-move hover:border-control-border",
                )}
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
              >
                <div className="flex items-center gap-3">
                  {staff ? (
                    <Avatar name={node.fullName} src={resolveProfileImageUrl(node.profileImage)} size="md" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full border text-fg-subtle",
                        node.positionKind === "external" ? "border-line bg-surface-muted" : "border-dashed border-control-border",
                      )}
                    >
                      {node.positionKind === "external" ? <Building2 size={16} /> : <UserRoundX size={16} />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <span className="block text-sm font-semibold leading-5 text-fg [overflow-wrap:anywhere]">{node.fullName}</span>
                    ) : (
                      <Link
                        to={`/people/${node.id}`}
                        className="block text-sm font-semibold leading-5 text-fg [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {node.fullName}
                      </Link>
                    )}
                    {!staff && (
                      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-fg-subtle">
                        {node.positionKind === "external"
                          ? "External · not employed here"
                          : node.occupancy === "filled_unnamed"
                            ? "Position · filled"
                            : "Position · not filled"}
                      </p>
                    )}
                    {node.occupancy === "filled_unnamed" && (
                      <p className="text-[0.6875rem] leading-4 text-fg-subtle">Employee details not entered</p>
                    )}
                    {node.reportingLineConfidence === "unconfirmed" && (
                      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-warning-fg">Reporting line unconfirmed</p>
                    )}
                    {node.jobTitle && <p className="line-clamp-2 text-xs leading-4 text-fg-muted">{node.jobTitle}</p>}
                    {node.departmentName && !node.jobTitle && (
                      <p className="truncate text-xs leading-4 text-fg-subtle">{node.departmentName}</p>
                    )}
                  </div>

                  {editing && (
                    <span className="flex shrink-0 flex-col items-center gap-1">
                      <GripVertical size={14} className="text-fg-subtle" aria-hidden="true" />
                      <button
                        type="button"
                        aria-label={`Actions for ${node.fullName}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); setMenuFor(menuFor === id ? null : id); }}
                        className="rounded p-0.5 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </span>
                  )}
                </div>

                {editing && menuFor === id && (
                  <div
                    className="absolute right-1 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-elevated py-1 shadow-raised"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {[
                      { label: "Edit position", run: () => handlers.onEditPosition(node) },
                      { label: "Add direct report", run: () => handlers.onAddReport(node) },
                      { label: "Start a reporting line", run: () => beginConnect(id), icon: true },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={(event) => { event.stopPropagation(); setMenuFor(null); item.run(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-muted"
                      >
                        {item.icon && <Link2 size={14} aria-hidden="true" />}
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
