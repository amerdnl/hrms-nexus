import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Network, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getOrgChart } from "../../api/peopleApi";
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
import type { OrgNode } from "../../types/people";
import { cn } from "../../utils/cn";

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
    getOrgChart()
      .then(setNodes)
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

  const renderCard = (node: OrgNode) => (
    <div
      ref={(element) => {
        if (element) cards.current.set(node.id, element);
        else cards.current.delete(node.id);
      }}
      className={cn(
        "relative w-56 rounded-xl border bg-surface px-3.5 py-3 text-left shadow-card transition-colors",
        highlight === node.id ? "border-primary ring-2 ring-primary-soft" : "border-line hover:border-control-border",
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={node.fullName} src={resolveProfileImageUrl(node.profileImage)} size="md" />
        <div className="min-w-0 flex-1">
          {/* Stretched over the card, so the whole node opens the profile. */}
          <Link
            to={`/people/${node.id}`}
            className="block text-sm font-semibold leading-5 text-fg [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl hover:text-primary focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
          >
            {node.fullName}
          </Link>
          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-fg-muted" title={node.jobTitle ?? undefined}>
            {node.jobTitle ?? "No title recorded"}
          </p>
          {node.departmentName && (
            <p className="mt-0.5 truncate text-xs leading-4 text-fg-subtle" title={node.departmentName}>{node.departmentName}</p>
          )}
        </div>
      </div>
    </div>
  );

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

  const showing = tree && highlight !== null && tree.byId.has(highlight)
    ? (() => {
        const below = countBelow(tree.children, highlight);
        return `Showing ${tree.byId.get(highlight)!.fullName}${below > 0 ? `, with ${below} ${below === 1 ? "person" : "people"} below them` : ""}.`;
      })()
    : "";

  return (
    <section className="space-y-6">
      <PageHeader
        title="Org chart"
        description="Who reports to whom, from the manager on each employee's record. Open anyone to see their profile."
        area="people"
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={ChevronsUpDown} onClick={() => setExpanded(new Set(tree.children.keys()))}>Expand all</Button>
            <Button variant="ghost" size="sm" icon={ChevronsDownUp} onClick={() => setExpanded(new Set())}>Collapse all</Button>
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
              {nodes!.length} {nodes!.length === 1 ? "person" : "people"} · {tree.lines} reporting line{tree.lines === 1 ? "" : "s"}
              {tree.roots.length > 1 ? ` · ${tree.roots.length} separate branches, each headed by someone with no recorded manager` : ""}
              {wide && tree.roots.length > 0 ? " · Scroll sideways to see the whole chart" : ""}
            </p>
            <p className="text-fg-subtle" role="status">{showing}</p>
          </div>

          {tree.roots.length > 0 ? (
            // Scrolls sideways inside itself, so a wide company never widens the page.
            <div
              ref={canvas}
              className="overflow-x-auto rounded-card border border-line bg-canvas shadow-card [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:1.25rem_1.25rem]"
            >
              <div className="flex w-max min-w-full justify-center px-6 py-8 sm:px-10">
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

          {tree.unplaced.length > 0 && (
            <SectionCard
              title="Not connected to the chart"
              description="The recorded reporting lines do not link these people to anyone, so the chart does not guess where they belong. A manager on their HR record places them."
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
    </section>
  );
}
