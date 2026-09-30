import { Building2, ChevronDown, ChevronsDownUp, ChevronsUpDown, Info, Network, Pencil, Plus, StickyNote, Printer, Search, UserRoundX, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getOrgChartWithCompany } from "../../api/peopleApi";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton from "../../components/ui/Skeleton";
import TextInput from "../../components/ui/TextInput";
import type { OrgLayoutBox, OrgNode, OrgSourceLink, OrgSourceNote } from "../../types/people";
import { cn } from "../../utils/cn";
import { useAuth } from "../../context/useAuth";
import PositionEditor, { draftFrom, emptyDraft, type PositionDraft } from "./PositionEditor";
import OrgCanvas from "./OrgCanvas";
import RelationshipDialog from "./RelationshipDialog";
import NoteDialog from "./NoteDialog";
import { saveLayout } from "../../api/orgApi";

/** How many people the chart shows before anyone opens a branch. */
const OPEN_BUDGET = 40;
/** Connector colour: --control-border, so the lines survive both themes. */
const LINE = "bg-control-border";

interface Tree {
  byId: Map<number, OrgNode>;
  children: Map<number, OrgNode[]>;
  /** Heads of a branch: no manager on the chart, and at least one report. */
  roots: OrgNode[];
  /** People the recorded reporting lines do not connect to anyone. */
  unplaced: OrgNode[];
  /** Reporting lines the chart draws. */
  lines: number;
}

/**
 * What to call a set of entries. A chart taken from a customer's own chart can
 * be entirely unfilled positions, and calling twenty-nine of those "people"
 * would be the one thing this page must never say.
 */
function entryWord(nodes: OrgNode[], count: number): string {
  if (nodes.some((node) => node.positionKind === "staff")) return count === 1 ? "person" : "people";
  return count === 1 ? "position" : "positions";
}

/** Everyone below a node, at any depth. */
function countBelow(children: Map<number, OrgNode[]>, id: number): number {
  const seen = new Set<number>([id]);
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next.id)) continue;
    seen.add(next.id);
    stack.push(...(children.get(next.id) ?? []));
  }
  return seen.size - 1;
}

function buildTree(nodes: OrgNode[]): Tree {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<number, OrgNode[]>();
  const tops: OrgNode[] = [];
  for (const node of nodes) {
    if (node.managerId !== null && node.managerId !== node.id && byId.has(node.managerId)) {
      children.set(node.managerId, [...(children.get(node.managerId) ?? []), node]);
    } else {
      tops.push(node);
    }
  }
  // Managers before individual contributors, then by name, so each level reads
  // as "who runs what" first.
  const order = (a: OrgNode, b: OrgNode) =>
    Number(children.has(b.id)) - Number(children.has(a.id)) || a.fullName.localeCompare(b.fullName);
  for (const list of children.values()) list.sort(order);

  // Only what hangs from a top can be drawn. A loop in the recorded lines has
  // no top, so the people in it are listed as unplaced rather than dropped.
  const reached = new Set<number>();
  const stack = [...tops];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (reached.has(next.id)) continue;
    reached.add(next.id);
    stack.push(...(children.get(next.id) ?? []));
  }

  const size = new Map(tops.map((node) => [node.id, countBelow(children, node.id)]));
  const roots = tops
    .filter((node) => children.has(node.id))
    .sort((a, b) => size.get(b.id)! - size.get(a.id)! || a.fullName.localeCompare(b.fullName));
  const unplaced = [
    ...tops.filter((node) => !children.has(node.id)),
    ...nodes.filter((node) => !reached.has(node.id)),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { byId, children, roots, unplaced, lines: reached.size - tops.length };
}

/** Opens levels from the top while the chart stays within OPEN_BUDGET people. */
function initialExpansion(tree: Tree): Set<number> {
  const open = new Set<number>();
  let visible = tree.roots.length;
  let level = tree.roots;
  while (level.length > 0) {
    const managers = level.filter((node) => tree.children.has(node.id));
    const added = managers.reduce((sum, node) => sum + tree.children.get(node.id)!.length, 0);
    // The first level always opens: leadership alone is not an org chart.
    if (open.size > 0 && visible + added > OPEN_BUDGET) break;
    for (const node of managers) open.add(node.id);
    visible += added;
    level = managers.flatMap((node) => tree.children.get(node.id)!);
  }
  return open;
}

/** `current` plus every manager above `id`, so that person is on screen. */
function withAncestors(tree: Tree, id: number, current: Set<number>): Set<number> {
  const next = new Set(current);
  const seen = new Set<number>();
  let cursor = tree.byId.get(id)?.managerId ?? null;
  while (cursor !== null && tree.byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    next.add(cursor);
    cursor = tree.byId.get(cursor)!.managerId;
  }
  return next;
}

/**
 * The org chart: who reports to whom, drawn top-down from the manager recorded
 * on each employee's record.
 *
 * Leadership sits at the top and each manager's reports hang beneath them on
 * connector lines. A manager whose reports lead no one themselves gets those
 * reports as a short column under them rather than a wide row, which keeps a
 * real company from sprawling sideways. Every branch opens and closes, the
 * canvas scrolls sideways when the company is wider than the screen, and Find
 * someone opens the branch above a person and brings them into the middle.
 *
 * For assistive technology it stays what it always was - nested lists, a
 * named expander per manager, and a link per person to their profile. Nothing
 * here is inferred: people without a recorded line are listed as such, not
 * attached to a guessed manager.
 */
export default function OrgChartPage() {
  const [params] = useSearchParams();
  const focusId = Number(params.get("focus")) || null;

  const [nodes, setNodes] = useState<OrgNode[] | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [layout, setLayout] = useState<OrgLayoutBox[]>([]);
  const [links, setLinks] = useState<OrgSourceLink[]>([]);
  const [sourceNotes, setSourceNotes] = useState<OrgSourceNote[]>([]);
  const [wire, setWire] = useState<{ childId: number; parentId: number; exists: boolean } | null>(null);
  const [note, setNote] = useState<OrgSourceNote | { id: null } | null>(null);
  const [banner, setBanner] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PositionDraft | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlight, setHighlight] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const cards = useRef(new Map<number, HTMLElement>());
  const canvas = useRef<HTMLDivElement>(null);
  // Whether the chart is wider than its frame, so the page can say it scrolls.
  const [wide, setWide] = useState(false);

  useEffect(() => {
    setError("");
    getOrgChartWithCompany()
      .then((result) => {
        setCompany(result.company);
        setNodes(result.nodes);
        setLayout(result.layout);
        setLinks(result.sourceLinks);
        setSourceNotes(result.sourceNotes);
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, "The org chart could not be loaded.")));
  }, [attempt]);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : null), [nodes]);

  // Re-measured when branches open or close and when the frame resizes.
  useEffect(() => {
    const box = canvas.current;
    if (!box) return;
    const measure = () => setWide(box.scrollWidth > box.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [tree, expanded]);

  function reveal(id: number) {
    if (!tree || !tree.byId.has(id)) return;
    setExpanded((current) => withAncestors(tree, id, current));
    setHighlight(id);
    setQuery("");
    // After the branches just opened have rendered.
    requestAnimationFrame(() => {
      const card = cards.current.get(id);
      if (!card) return;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "center", inline: "center", behavior: smooth ? "smooth" : "auto" });
      card.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    });
  }

  // First load: open the top of the chart, centre it, and follow ?focus= from
  // a profile's "Show in org chart".
  useEffect(() => {
    if (!tree) return;
    setExpanded(initialExpansion(tree));
    if (focusId && tree.byId.has(focusId)) {
      reveal(focusId);
      return;
    }
    requestAnimationFrame(() => {
      const top = tree.roots[0];
      const card = top ? cards.current.get(top.id) : undefined;
      const box = canvas.current;
      if (!card || !box) return;
      const left = card.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
      box.scrollLeft = Math.max(0, left + card.offsetWidth / 2 - box.clientWidth / 2);
    });
    // reveal reads the tree just built; running this again on every change
    // would fight the user's own opening and closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !nodes) return [];
    return nodes
      .filter((node) =>
        [node.fullName, node.jobTitle ?? "", node.departmentName ?? ""].some((value) => value.toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [nodes, query]);

  function onFindKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && matches[0]) {
      event.preventDefault();
      reveal(matches[0].id);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  }

  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * What the printed sheet needs: the scale that puts the whole chart on one
   * piece of paper, and the height it then occupies.
   *
   * Paper cannot scroll, so this is the one place scaling to fit is right - and
   * A3 rather than A4, because a company's chart on A4 is either unreadable or
   * cut into pieces. Measured from what is actually drawn, so it follows the
   * chart as branches open and close.
   */
  const [printFit, setPrintFit] = useState<React.CSSProperties>({});
  useEffect(() => {
    const box = canvas.current;
    const inner = box?.firstElementChild as HTMLElement | null;
    if (!box || !inner) return;
    // A3 landscape at 96dpi, less 10mm margins and the heading above the chart.
    const sheet = { width: 420 * (96 / 25.4) - 76, height: 297 * (96 / 25.4) - 76 - 205 };
    const width = inner.scrollWidth;
    const height = inner.scrollHeight;
    if (width < 1 || height < 1) return;
    const scale = Math.min(sheet.width / width, sheet.height / height, 1);
    setPrintFit({
      "--print-scale": scale,
      "--print-height": `${Math.ceil(height * scale)}px`,
    } as React.CSSProperties);
  }, [tree, expanded]);

  /**
   * Whether this company's chart has a saved layout covering every card. A
   * company without one - Meridian, or any new customer - keeps the automatic
   * tree, so nothing about EDUK8U's arrangement reaches it.
   */
  const placed = useMemo(
    () => layout.length > 0 && nodes !== null && nodes.every((node) => layout.some((box) => box.id === node.id)),
    [layout, nodes],
  );

  const reload = () => { setNodes(null); setAttempt((count) => count + 1); };

  const nameOf = (id: number) => tree?.byId.get(id)?.fullName ?? "";

  // The departments already on the chart. Enough for the editor, and it avoids
  // a second request for a list the page is holding anyway.
  const departments = useMemo(() => {
    const seen = new Map<number, string>();
    for (const node of nodes ?? []) {
      if (node.departmentId !== null && node.departmentName) seen.set(node.departmentId, node.departmentName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  const renderCard = (node: OrgNode) => {
    const staff = node.positionKind === "staff";
    return (
      <div
        ref={(element) => {
          if (element) cards.current.set(node.id, element);
          else cards.current.delete(node.id);
        }}
        className={cn(
          "relative w-56 rounded-xl border bg-surface px-3.5 py-3 text-left shadow-card transition-colors",
          // An unfilled position is drawn as an outline, the way a plan is drawn
          // next to something that has been built.
          node.positionKind === "vacant" && "border-dashed bg-surface-muted",
          highlight === node.id ? "border-primary ring-2 ring-primary-soft" : "border-line hover:border-control-border",
        )}
      >
        <div className="flex items-center gap-3">
          {/* A face, or initials standing in for one, asserts a person. Only a
              record that describes one gets either. */}
          {staff ? (
            <Avatar name={node.fullName} src={resolveProfileImageUrl(node.profileImage)} size="md" />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full border text-fg-subtle",
                node.positionKind === "vacant" ? "border-dashed border-control-border" : "border-line bg-surface-muted",
              )}
            >
              {node.positionKind === "vacant" ? <UserRoundX size={16} /> : <Building2 size={16} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {/* Stretched over the card, so the whole node opens the profile. */}
            {editing ? (
              // In edit mode the card is the way into the editor, so the whole
              // of it is the button rather than a small pencil nobody finds.
              <button
                type="button"
                onClick={() => setDraft(draftFrom(node))}
                className="block text-left text-sm font-semibold leading-5 text-fg [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl hover:text-primary focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
              >
                {node.fullName}
                <span className="sr-only"> — edit this position</span>
              </button>
            ) : (
              <Link
                to={`/people/${node.id}`}
                className="block text-sm font-semibold leading-5 text-fg [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl hover:text-primary focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
              >
                {node.fullName}
              </Link>
            )}
            {!staff && (
              // Said in words, not only in the border: the distinction has to
              // survive being printed in black and white and being read aloud.
              // A post can be held without HR knowing by whom, and saying so is
              // the alternative to inventing somebody to put in it.
              <p className="mt-1 text-[0.6875rem] font-medium uppercase tracking-wide text-fg-subtle">
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
              // A dashed connector is easy to miss and says nothing to a screen
              // reader, so the doubt is written on the card as well. The chart
              // is going back to the person whose organisation it describes for
              // exactly this: to be told where it is wrong.
              <p className="mt-1 text-[0.6875rem] font-medium uppercase tracking-wide text-warning-fg">
                Reporting line unconfirmed
              </p>
            )}
            {/* Three lines: EDUK8U-style titles ("LMS, SMS, AI Agentic Bot,
                Platforms") do not fit in two, and the full text is in `title`
                and in the printed copy either way. */}
            <p className="mt-0.5 line-clamp-3 text-xs leading-4 text-fg-muted print:line-clamp-none" title={node.jobTitle ?? undefined}>
              {node.jobTitle ?? (staff ? "No title recorded" : "")}
            </p>
            {node.departmentName && (
              <p className="mt-0.5 truncate text-xs leading-4 text-fg-subtle print:overflow-visible print:whitespace-normal" title={node.departmentName}>{node.departmentName}</p>
            )}
            {node.alsoReportsTo.length > 0 && (
              // Somebody who answers to more than one person. The chart draws
              // one line and names the rest, rather than pretending there is
              // only one.
              <p className="mt-0.5 text-[0.6875rem] leading-4 text-fg-subtle">
                Also reports to {node.alsoReportsTo.map((id) => nameOf(id)).filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBranch = (node: OrgNode): ReactNode => {
    const reports = tree!.children.get(node.id) ?? [];
    const isOpen = expanded.has(node.id);
    const listId = `org-reports-${node.id}`;
    const plural = reports.length === 1 ? "" : "s";
    // Reports who lead no one themselves stack under their manager.
    const stacked = reports.length > 1 && reports.every((report) => !tree!.children.has(report.id));

    return (
      <>
        {renderCard(node)}
        {reports.length > 0 && (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            aria-expanded={isOpen}
            aria-controls={isOpen ? listId : undefined}
            title={`${isOpen ? "Hide" : "Show"} ${reports.length} direct report${plural}`}
            className="relative z-10 -mt-3 inline-flex h-6 items-center gap-1 rounded-full border border-control-border bg-surface pl-2 pr-1.5 text-xs font-semibold tabular-nums text-fg-muted shadow-card transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-8"
          >
            <UsersRound size={12} aria-hidden="true" />
            {reports.length}
            <span className="sr-only"> direct report{plural} of {node.fullName}</span>
            <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} />
          </button>
        )}
        {reports.length > 0 && isOpen && (stacked ? (
          <>
            <span aria-hidden="true" className={cn("h-3 w-px shrink-0", LINE)} />
            <div className="relative pl-6 pt-4">
              {/* Elbow from the manager's line across to the column's spine. */}
              <span aria-hidden="true" className={cn("absolute left-3 right-1/2 top-0 h-px", LINE)} />
              <ul id={listId} className="flex flex-col gap-2">
                {reports.map((report, index) => (
                  <li key={report.id} className="relative">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -left-3 w-px",
                        LINE,
                        index === 0 ? "-top-4" : "-top-2",
                        // The spine stops at the last card's connector.
                        index === reports.length - 1 ? "h-[calc(50%_+_0.5rem)]" : "bottom-0",
                      )}
                    />
                    <span aria-hidden="true" className={cn("absolute -left-3 top-1/2 h-px w-3", LINE)} />
                    {renderCard(report)}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <span aria-hidden="true" className={cn("h-4 w-px shrink-0", LINE)} />
            <ul id={listId} className="flex items-start">
              {reports.map((report, index) => (
                <li key={report.id} className="relative flex flex-col items-center px-3 pt-4">
                  {reports.length > 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-0 h-px",
                        LINE,
                        index === 0 ? "left-1/2 right-0" : index === reports.length - 1 ? "left-0 right-1/2" : "inset-x-0",
                      )}
                    />
                  )}
                  <span aria-hidden="true" className={cn("absolute left-[calc(50%_-_0.5px)] top-0 h-4 w-px", LINE)} />
                  {renderBranch(report)}
                </li>
              ))}
            </ul>
          </>
        ))}
      </>
    );
  };

  /**
   * Hands the chart to the browser's own print dialogue, which is also how it
   * becomes a PDF to send on.
   *
   * A source-placed chart prints as one drawing on one sheet: it is a picture of
   * a company, and a picture split over nine pages is not one. The scale that
   * fits an A3 sheet is worked out here and applied while the dialogue is open,
   * because a chart that reflows to fit the paper is no longer the chart.
   *
   * The automatic layout has no fixed size to fit, so it prints as before, with
   * every branch opened first - a collapsed branch is not in the document at all
   * and would print as though it did not exist.
   */
  const printChart = () => {
    // A source-placed chart is already whole and already knows the scale that
    // fits it onto one sheet; the print stylesheet applies it. The automatic
    // layout has branches that may be closed, and a closed branch is not in the
    // document at all, so it would print as though it did not exist.
    if (tree) setExpanded(new Set(tree.children.keys()));
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const showing = tree && highlight !== null && tree.byId.has(highlight)
    ? (() => {
        const below = countBelow(tree.children, highlight);
        return `Showing ${tree.byId.get(highlight)!.fullName}${below > 0 ? `, with ${below} ${below === 1 ? "person" : "people"} below them` : ""}.`;
      })()
    : "";

  return (
    <section className="space-y-6 print-chart-sheet">
      {/* On screen the shell already says whose company this is. On paper there
          is no shell, and the sheet travels: it has to name the organisation it
          describes, and when it was taken, or it is a chart of nobody. */}
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold text-fg">{company ?? "Organisation"} — org chart</h1>
        <p className="mt-1 text-xs text-fg-muted">
          From HR Nexus on {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.
          Drawn from the manager recorded on each record. A line marked “reporting line unconfirmed” is one the
          chart’s source does not settle.
        </p>
      </div>

      <div className="print:hidden">
        <PageHeader
          title="Org chart"
          description="Who reports to whom, from the manager on each employee's record. Open anyone to see their profile."
          area="people"
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div className="relative w-full lg:max-w-md">
          <FormField id="org-find" label="Find someone" hint="Opens their branch and brings them into view.">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <TextInput
                id="org-find"
                type="search"
                className="pl-9"
                placeholder="Name, role or department"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onFindKeyDown}
                aria-describedby={fieldDescribedBy("org-find", { hint: true })}
              />
            </div>
          </FormField>
          {query.trim() && nodes && (
            <ul
              aria-label="Matching people"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 divide-y divide-line overflow-auto rounded-xl border border-line bg-elevated shadow-raised"
            >
              {matches.length === 0 ? (
                <li className="px-4 py-3 text-sm text-fg-muted">No one matches.</li>
              ) : matches.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => reveal(node.id)}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <Avatar name={node.fullName} src={resolveProfileImageUrl(node.profileImage)} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">{node.fullName}</span>
                      <span className="block text-xs text-fg-subtle [overflow-wrap:anywhere]">
                        {[node.jobTitle, node.departmentName].filter(Boolean).join(" · ") || "No role recorded"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {tree && tree.roots.length > 0 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="secondary" size="sm" icon={ChevronsUpDown} onClick={() => setExpanded(new Set(tree.children.keys()))}>Expand all</Button>
            <Button variant="ghost" size="sm" icon={ChevronsDownUp} onClick={() => setExpanded(new Set())}>Collapse all</Button>
            {isAdmin && (
              <>
                <Button variant={editing ? "primary" : "secondary"} size="sm" icon={Pencil} onClick={() => setEditing((on) => !on)}>
                  {editing ? "Done editing" : "Edit org chart"}
                </Button>
                {editing && (
                  <>
                    <Button variant="secondary" size="sm" icon={Plus} onClick={() => setDraft(emptyDraft)}>Add position</Button>
                    {placed && (
                      <Button variant="ghost" size="sm" icon={StickyNote} onClick={() => setNote({ id: null })}>Add note</Button>
                    )}
                  </>
                )}
              </>
            )}
            <Button variant="ghost" size="sm" icon={Printer} onClick={printChart}>Print or save as PDF</Button>
          </div>
        )}
      </div>

      {error ? (
        <SectionCard>
          <ErrorState
            title="The org chart could not be loaded"
            description={error}
            onRetry={() => {
              setNodes(null);
              setAttempt((count) => count + 1);
            }}
          />
        </SectionCard>
      ) : !tree ? (
        <div className="flex flex-col items-center gap-6 rounded-card border border-line bg-surface px-6 py-10 shadow-card" aria-busy="true">
          <p className="sr-only" role="status">Loading the org chart</p>
          <Skeleton className="h-16 w-56 rounded-xl" />
          <div className="flex gap-6">
            {[0, 1, 2].map((key) => <Skeleton key={key} className="h-16 w-40 rounded-xl sm:w-56" />)}
          </div>
        </div>
      ) : nodes!.length === 0 ? (
        <SectionCard>
          <EmptyState icon={Network} title="No one is on the chart yet" description="People appear here once HR adds them." />
        </SectionCard>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
            <p className="text-fg-muted">
              {nodes!.length} {entryWord(nodes!, nodes!.length)} · {tree.lines} reporting line{tree.lines === 1 ? "" : "s"}
              {tree.roots.length > 1 ? ` · ${tree.roots.length} separate branches, each headed by someone with no recorded manager` : ""}
              {wide && tree.roots.length > 0 ? " · Scroll sideways to see the whole chart" : ""}
            </p>
            <p className="text-fg-subtle" role="status">{showing}</p>
          </div>

          {/* A legend, because the chart uses three visual distinctions and a
              printed copy has nobody to ask about them. */}
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-fg-muted">
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block size-3 rounded border border-dashed border-control-border bg-surface-muted" />
              Vacant position
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block size-3 rounded border border-line bg-surface-muted" />
              External / advisory
            </li>
            <li className="flex items-center gap-1.5">
              <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--warning-fg)" strokeWidth="1.75" strokeDasharray="6 5" /></svg>
              Unconfirmed reporting line
            </li>
          </ul>

          {placed ? (
            <OrgCanvas
              nodes={nodes!}
              layout={layout}
              links={links}
              notes={sourceNotes}
              editing={editing}
              highlight={highlight}
              handlers={{
                onMove: (positions, movedNotes) => {
                  // Layout only. Saved quietly, because moving a card is not an
                  // HR decision and must never look like one.
                  void saveLayout(positions, movedNotes).catch(() => setBanner("That move could not be saved."));
                },
                onEditPosition: (node) => setDraft(draftFrom(node)),
                onAddReport: (manager) => setDraft({ ...emptyDraft, managerId: manager.id, departmentId: manager.departmentId }),
                onEditNote: (chosen) => setNote(chosen),
                onConnect: (childId, parentId) => setWire({ childId, parentId, exists: false }),
                onSelectWire: (childId, parentId) => setWire({ childId, parentId, exists: true }),
              }}
            />
          ) : tree.roots.length > 0 ? (
            // Scrolls sideways inside itself, so a wide company never widens the page.
            <div
              ref={canvas}
              data-chart-viewport
              className="overflow-x-auto rounded-card border border-line bg-canvas shadow-card [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:1.25rem_1.25rem]"
              style={printFit}
            >
              <div data-chart-canvas className="flex w-max min-w-full justify-center px-6 py-8 sm:px-10">
                <ul aria-label="Organisation" className="flex items-start gap-12">
                  {tree.roots.map((root) => (
                    <li key={root.id} className="flex flex-col items-center">{renderBranch(root)}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <SectionCard>
              <EmptyState
                icon={Network}
                title="No reporting lines are recorded yet"
                description="The chart draws who reports to whom once employees have a manager on their HR record. Until then, everyone is listed below."
              />
            </SectionCard>
          )}

          {/* When the chart is laid out, every card is already on it - including
              the external parties below the dividing rule - so listing them
              again underneath would say the chart had failed to place them. */}
          {!placed && tree.unplaced.length > 0 && (
            <SectionCard
              title="Not connected to the chart"
              description={
                tree.unplaced.every((node) => node.positionKind === "external")
                  ? "External consultants, advisers and partners. They are shown here rather than in the hierarchy because they are not employed here and have no reporting line on the source chart."
                  : "The recorded reporting lines do not link these entries to anyone, so the chart does not guess where they belong. A manager on their HR record places them."
              }
              icon={UsersRound}
            >
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tree.unplaced.map((node) => (
                  <li key={node.id} className="[&>div]:w-full">{renderCard(node)}</li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}

      {/* Context from the company's own chart that describes no post: a
          heading over a column, a list of the streams a function sells into.
          Shown as information, never as people. */}
      {!placed && sourceNotes.length > 0 && (
        <SectionCard title="From the source chart" description="Context recorded with this organisation. Not positions and not people." icon={Info}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sourceNotes.map((note) => (
              <li key={note.id} className="rounded-card border border-dashed border-line bg-surface-muted px-3.5 py-3">
                <p className="text-sm font-semibold text-fg">{note.label}</p>
                {note.body && <p className="mt-1 whitespace-pre-line text-xs leading-5 text-fg-muted">{note.body}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {banner && <Alert tone="danger" title="That did not save">{banner}</Alert>}

      {isAdmin && wire && (
        <RelationshipDialog
          childName={nameOf(wire.childId)}
          parentName={nameOf(wire.parentId)}
          childId={wire.childId}
          parentId={wire.parentId}
          existing={wire.exists}
          onClose={() => setWire(null)}
          onSaved={() => { setWire(null); reload(); }}
        />
      )}

      {isAdmin && note && (
        <NoteDialog
          note={note}
          onClose={() => setNote(null)}
          onSaved={() => { setNote(null); reload(); }}
        />
      )}

      {isAdmin && (
        <PositionEditor
          draft={draft}
          nodes={nodes ?? []}
          departments={departments}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            // Re-read from the server rather than patching state, so what the
            // chart shows is what was actually stored.
            reload();
          }}
        />
      )}
    </section>
  );
}
