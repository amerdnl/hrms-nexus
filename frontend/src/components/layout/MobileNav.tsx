import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { isPrimaryActive, primaryNavigationFor } from "../../routes/navigation";
import { cn } from "../../utils/cn";

/**
 * The bottom bar: the header's four persistent destinations, within thumb
 * reach below md.
 *
 * It no longer carries a "More" slot. Every other module lives in the App
 * Launcher, which opens from the header at every width - so a phone and a
 * laptop reach the same directory the same way, and the bar's four slots are
 * wide enough to read without truncation.
 */
export default function MobileNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-header md:hidden",
        // Keeps the row clear of the home indicator on a notched phone.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex">
        {primaryNavigationFor(user).map((item) => {
          const active = isPrimaryActive(item, pathname);
          return (
            <li key={item.id} className="flex-1">
              <Link
                to={item.to}
                aria-current={pathname === item.to ? "page" : active ? "true" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  active ? "text-primary" : "text-fg-muted hover:text-fg",
                )}
              >
                {/* The active slot is marked by a filled pill behind a filled
                    icon as well as by hue, so the state does not rest on
                    colour alone. */}
                <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <item.icon size={20} fill={active && item.id === "home" ? "currentColor" : "none"} aria-hidden="true" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
