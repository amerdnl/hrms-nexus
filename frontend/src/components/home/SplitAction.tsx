import { ChevronDown, Plus, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DropdownMenu from "../ui/DropdownMenu";

export interface SplitActionItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Home's one primary action, as the reference's split button: the main action
 * on the left, and its related actions behind the chevron. Every entry is a
 * real destination the session may open; the destination still checks.
 */
export default function SplitAction({ primary, more }: { primary: SplitActionItem; more: SplitActionItem[] }) {
  const navigate = useNavigate();

  return (
    <div className="inline-flex h-11 items-stretch rounded-full bg-ink text-ink-fg shadow-raised">
      <Link
        to={primary.to}
        className="flex items-center gap-2.5 rounded-l-full pl-5 pr-4 text-sm font-medium transition-colors hover:bg-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Plus size={17} aria-hidden="true" />
        {primary.label}
      </Link>
      {more.length > 0 && (
        <>
          <span aria-hidden="true" className="my-3 w-px bg-ink-fg/20" />
          <DropdownMenu
            unstyled
            label={`More actions like ${primary.label}`}
            align="start"
            className="rounded-r-full pl-3.5 pr-4 text-ink-fg hover:bg-ink-hover"
            trigger={<ChevronDown size={17} aria-hidden="true" />}
            items={more.map((item) => ({
              key: item.to,
              label: item.label,
              icon: <item.icon size={16} aria-hidden="true" />,
              onSelect: () => navigate(item.to),
            }))}
          />
        </>
      )}
    </div>
  );
}
