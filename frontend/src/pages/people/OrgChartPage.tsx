import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Network, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getOrgChart } from "../../api/peopleApi";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import TextInput from "../../components/ui/TextInput";
import type { OrgNode } from "../../types/people";
import { cn } from "../../utils/cn";

interface Tree {
  byId: Map<number, OrgNode>;
  children: Map<number, OrgNode[]>;
  roots: OrgNode[];
}

function buildTree(nodes: OrgNode[]): Tree {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<number, OrgNode[]>();
  const roots: OrgNode[] = [];
  for (const node of nodes) {
    if (node.managerId !== null && byId.has(node.managerId)) {
      children.set(node.managerId, [...(children.get(node.managerId) ?? []), node]);
    } else {
      roots.push(node);
    }
  }
  // Managers before individual contributors, then by name, so each level reads
  // as "who runs what" first.
  const order = (a: OrgNode, b: OrgNode) =>
    Number(children.has(b.id)) - Number(children.has(a.id)) || a.fullName.localeCompare(b.fullName);
  roots.sort(order);
  for (const list of children.values()) list.sort(order);
  return { byId, children, roots };
}

/** Everyone below a node, at any depth. */
function countBelow(tree: Tree, id: number): number {
  let total = 0;
  const stack = [...(tree.children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    total += 1;
    stack.push(...(tree.children.get(next.id) ?? []));
  }
  return total;
}

/**
 * The org chart as an outline you can open and close.
 *
 * An outline rather than a wide box diagram on purpose: it works the same at
 * 375px as at 1280px, reads top to bottom for a screen reader as nested lists,
 * and every expander is an ordinary button that says how many people it hides.
 * Everyone on it is a link to their profile. The data is the social layer the
 * server sends for people currently employed; nothing else is on the chart.
 */
export default function OrgChartPage() {
  const [params] = useSearchParams();
  const focusId = Number(params.get("focus")) || null;

  const [nodes, setNodes] = useState<OrgNode[] | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlight, setHighlight] = useState<number | null>(focusId);
  const [query, setQuery] = useState("");
  const nodeRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    getOrgChart().then(setNodes).catch((requestError) => setError(getApiErrorMessage(requestError, "The org chart could not be loaded.")));
  }, []);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : null), [nodes]);

  /** Opens every manager above `id` so it is on screen, and marks it. */
  function reveal(id: number) {
    if (!tree) return;
    const path = new Set(expanded);
    let cursor = tree.byId.get(id)?.managerId ?? null;
    while (cursor !== null && tree.byId.has(cursor)) {
      path.add(cursor);
      cursor = tree.byId.get(cursor)!.managerId;
    }
    setExpanded(path);
    setHighlight(id);
    setQuery("");
    // After the newly opened branches have rendered.
    requestAnimationFrame(() => {
      const element = nodeRefs.current.get(id);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    });
  }

  // First load: open the top level, and follow ?focus= from a profile.
  useEffect(() => {
    if (!tree) return;
    setExpanded(new Set(tree.roots.filter((root) => tree.children.has(root.id)).map((root) => root.id)));
    if (focusId && tree.byId.has(focusId)) reveal(focusId);
    // reveal reads the tree just built; running it again on every change would
    // fight the user's own opening and closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !nodes) return [];
    return nodes
      .filter((node) => node.fullName.toLowerCase().includes(term) || (node.jobTitle ?? "").toLowerCase().includes(term))
      .slice(0, 8);
  }, [nodes, query]);

  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const renderNode = (node: OrgNode, depth: number) => {
    const reports = tree!.children.get(node.id) ?? [];
    const isOpen = expanded.has(node.id);
    const listId = `org-reports-${node.id}`;
    return (
      <li key={node.id} ref={(element) => { if (element) nodeRefs.current.set(node.id, element); }}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-3 transition-colors",
            highlight === node.id ? "border-primary ring-2 ring-primary-soft" : "border-line",
          )}
        >
          <Avatar name={node.fullName} src={resolveProfileImageUrl(node.profileImage)} size="md" />
          <div className="min-w-0 flex-1 basis-40">
            <Link
              to={`/people/${node.id}`}
              className="font-semibold text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
            >
              {node.fullName}
            </Link>
            <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
              {[node.jobTitle, node.departmentName].filter(Boolean).join(" · ") || "No role recorded"}
            </p>
          </div>
          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-expanded={isOpen}
              aria-controls={listId}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-control-border px-3 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {reports.length} direct{reports.length === 1 ? "" : "s"}
              <span className="sr-only"> of {node.fullName}</span>
              <ChevronDown size={14} aria-hidden="true" className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>
          )}
        </div>
        {reports.length > 0 && isOpen && (
          <ul id={listId} className={cn("mt-2 space-y-2 border-l border-line-strong pl-3 sm:pl-5", depth < 6 ? "ml-4 sm:ml-6" : "ml-2")}>
            {reports.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const managers = tree ? [...tree.children.keys()] : [];

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Org chart"
        description="How the company is organised. Open anyone to see their profile."
        actions={tree && (
          <>
            <Button variant="secondary" size="sm" icon={ChevronsUpDown} onClick={() => setExpanded(new Set(managers))}>Expand all</Button>
            <Button variant="ghost" size="sm" icon={ChevronsDownUp} onClick={() => setExpanded(new Set())}>Collapse all</Button>
          </>
        )}
      />

      <SectionCard>
        <FormField id="org-find" label="Find someone" hint="Opens the chart at that person.">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <TextInput
              id="org-find"
              type="search"
              className="pl-9"
              placeholder="Name or role"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby="org-find-hint"
            />
          </div>
        </FormField>
        {query.trim() && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Matching people">
            {matches.length === 0 ? (
              <li className="px-4 py-3 text-sm text-fg-muted">No one matches.</li>
            ) : matches.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => reveal(node.id)}
                  className="flex w-full min-h-11 items-center gap-3 px-4 py-2 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <Avatar name={node.fullName} src={resolveProfileImageUrl(node.profileImage)} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">{node.fullName}</span>
                    <span className="block text-xs text-fg-subtle [overflow-wrap:anywhere]">{node.jobTitle ?? "No role recorded"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {error ? (
        <SectionCard><ErrorState title="The org chart could not be loaded" description={error} onRetry={() => window.location.reload()} /></SectionCard>
      ) : !tree ? (
        <SectionCard><p className="sr-only" role="status">Loading the org chart</p><SkeletonText lines={6} /></SectionCard>
      ) : tree.roots.length === 0 ? (
        <SectionCard><EmptyState icon={Network} title="No one is on the chart yet" description="People appear here once HR adds them." /></SectionCard>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {nodes!.length} people · {tree.roots.length} at the top level
            {tree.roots.length > 1 ? " (anyone without a recorded manager starts a branch)" : ""}
          </p>
          <ul className="space-y-2" aria-label="Organisation">
            {tree.roots.map((root) => renderNode(root, 0))}
          </ul>
          {highlight !== null && tree.byId.has(highlight) && (
            <p className="text-xs text-fg-subtle" role="status">
              Showing {tree.byId.get(highlight)!.fullName}
              {countBelow(tree, highlight) > 0 ? `, with ${countBelow(tree, highlight)} people below them` : ""}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
