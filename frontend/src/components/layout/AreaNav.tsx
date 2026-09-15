import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { areaNavigationFor, isDestinationActive, type NavigationArea } from "../../routes/navigation";
import { cn } from "../../utils/cn";

/**
 * The pages inside one header destination, as a row of tabs under the page
 * title: People, Departments and Org chart; or the Action Center, My tasks and
 * the HR processes their items come from.
 *
 * It is what makes an area explain itself to someone opening it for the first
 * time, and it is built from the same registry as the header and the App
 * Launcher, so it cannot offer a page the session could not open there.
 */
export default function AreaNav({ area }: { area: NavigationArea }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null;

  const section = areaNavigationFor(user, area);
  if (section.items.length < 2) return null;

  return (
    // Scrolls sideways on a phone rather than wrapping into a second row of tabs.
    <nav aria-label={`${section.label} pages`} className="mt-5 overflow-x-auto [scrollbar-width:none]">
      <ul className="flex min-w-max gap-1 shadow-[inset_0_-1px_0_var(--line)]">
        {section.items.map((item) => {
          const active = isDestinationActive(item, pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-10 items-center gap-2 rounded-t-lg px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                <item.icon size={16} aria-hidden="true" className={active ? "text-primary" : undefined} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
