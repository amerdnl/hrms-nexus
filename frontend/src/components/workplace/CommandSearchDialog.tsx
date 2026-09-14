import { ArrowRight, Building2, FileText, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import { searchWorkplace } from "../../api/workplaceApi";
import type { SearchResults } from "../../types/workplace";
import { cn } from "../../utils/cn";
import Avatar from "../ui/Avatar";
import Modal from "../ui/Modal";

interface Option {
  key: string;
  group: string;
  label: string;
  detail: string | null;
  path: string;
  kind: "person" | "department" | "destination" | "record";
  image?: string | null;
}

function toOptions(results: SearchResults): Option[] {
  return [
    ...results.people.map((person): Option => ({
      key: `person-${person.id}`, group: "People", label: person.fullName,
      detail: [person.jobTitle, person.departmentName].filter(Boolean).join(" · ") || null,
      path: person.path, kind: "person", image: person.profileImage,
    })),
    ...results.departments.map((department): Option => ({
      key: `department-${department.id}`, group: "Departments", label: department.name,
      detail: `${department.people} ${department.people === 1 ? "person" : "people"}`,
      path: department.path, kind: "department",
    })),
    ...results.destinations.map((destination): Option => ({
      key: `page-${destination.path}`, group: "Go to", label: destination.label,
      detail: destination.description, path: destination.path, kind: "destination",
    })),
    ...results.records.map((record): Option => ({
      key: `record-${record.id}`, group: "HR records", label: record.fullName,
      detail: `${record.employeeNumber} · ${record.status}`, path: record.path, kind: "record",
    })),
  ];
}

/**
 * Global search as a command palette: people, departments, pages, and for HR
 * the employee records. The server decides what is in the results, so nothing
 * appears here that the destination would refuse.
 *
 * A combobox over one listbox: arrow keys move the highlighted option, Enter
 * opens it, Escape closes (the Modal restores focus to the trigger).
 */
export default function CommandSearchDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const listId = useId();

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults(null);
      setStatus("idle");
    }
  }, [isOpen]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      searchWorkplace(term, controller.signal)
        .then((found) => {
          setResults(found);
          setActive(0);
          setStatus("idle");
        })
        .catch((error: { name?: string; code?: string }) => {
          if (error?.name !== "CanceledError" && error?.code !== "ERR_CANCELED") setStatus("failed");
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const options = useMemo(() => (results ? toOptions(results) : []), [results]);

  function choose(option: Option | undefined) {
    if (!option) return;
    onClose();
    navigate(option.path);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[active]);
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const groups = [...new Set(options.map((option) => option.group))];
  const term = query.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search" size="lg" initialFocusRef={inputRef}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={100}
          placeholder="People, departments or pages"
          role="combobox"
          aria-label="Search HR Nexus"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length > 0 ? `${listId}-option-${active}` : undefined}
          className="h-11 w-full rounded-lg border border-control-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-ring"
        />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {status === "loading" ? "Searching" : results ? `${options.length} result${options.length === 1 ? "" : "s"}` : ""}
      </p>

      {/* Focusable so a keyboard user can scroll a long result list directly
          (WCAG 2.1.1); the arrow keys in the field still move the highlight. */}
      <div className="mt-3 max-h-[min(26rem,60vh)] overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label="Scrollable results">
        {term.length < 2 && <p className="px-1 py-6 text-center text-sm text-fg-muted">Type at least two characters.</p>}
        {term.length >= 2 && status === "failed" && <p className="px-1 py-6 text-center text-sm text-fg-muted">Search is unavailable right now. Try again in a moment.</p>}
        {term.length >= 2 && status !== "failed" && results && options.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-fg-muted">Nothing matches “{term}”.</p>
        )}
        <div id={listId} role="listbox" aria-label="Search results" hidden={options.length === 0}>
          {groups.map((group) => (
            <div key={group} role="group" aria-labelledby={`${listId}-${group}`} className="mb-2">
              <p id={`${listId}-${group}`} className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{group}</p>
              {options.map((option, index) => option.group !== group ? null : (
                <div
                  key={option.key}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
                    index === active ? "bg-primary-soft" : "hover:bg-surface-muted",
                  )}
                >
                  {option.kind === "person" ? (
                    <Avatar name={option.label} src={resolveProfileImageUrl(option.image ?? null)} size="sm" />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                      {option.kind === "department" ? <Building2 size={15} aria-hidden="true" />
                        : option.kind === "record" ? <FileText size={15} aria-hidden="true" />
                        : <ArrowRight size={15} aria-hidden="true" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">{option.label}</span>
                    {option.detail && <span className="block text-xs text-fg-subtle [overflow-wrap:anywhere]">{option.detail}</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
