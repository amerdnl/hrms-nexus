import { Ellipsis } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import {
  mobileOverflowFor,
  mobilePrimaryFor,
  type NavigationItem,
} from "../../routes/navigation";
import { cn } from "../../utils/cn";
import Sheet from "../ui/Sheet";

const slot =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * The bottom navigation, and the only navigation below md.
 *
 * It replaces the slide-out drawer rather than joining it. Two navigations
 * over the same destinations is two things to keep in step and two things for
 * a user to learn, and the drawer's own comment already showed the cost: it
 * needed `visibility: hidden` purely so its links left the tab order while
 * off-screen. Nothing is off-screen here.
 *
 * Five slots. An employee has exactly five destinations, so all five are
 * direct. An administrator has eleven, so four are direct and the rest open in
 * a sheet behind "More" - the sheet reuses Modal, so it inherits the focus
 * trap and focus restore rather than reimplementing them.
 */
export default function MobileNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // A route change must close the sheet, or tapping a destination inside it
  // navigates behind a panel that stays up.
  useEffect(() => setIsMoreOpen(false), [pathname]);

  if (!user) return null;

  const primary = mobilePrimaryFor(user.role);
  const overflow = mobileOverflowFor(user.role);
  const isOverflowActive = overflow.some((item) => pathname.startsWith(item.to));

  const renderLink = ({ icon: Icon, label, shortLabel, to }: NavigationItem) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        cn(slot, isActive ? "text-primary" : "text-fg-muted hover:text-fg")
      }
    >
      {({ isActive }) => (
        <>
          {/* The active slot is marked by a filled pill behind the icon as
              well as by hue, so the state does not rest on colour alone.
              NavLink sets aria-current itself. */}
          <span
            className={cn(
              "grid h-7 w-12 place-items-center rounded-full transition-colors",
              isActive && "bg-primary-soft",
            )}
          >
            <Icon size={19} aria-hidden="true" />
          </span>
          <span className="max-w-full truncate">{shortLabel ?? label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden",
          // Keeps the row clear of the home indicator on a notched phone.
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {primary.map(renderLink)}

        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            className={cn(
              slot,
              // "More" also lights up when the page you are on lives inside
              // it, so the bar never claims nothing is selected.
              isOverflowActive || isMoreOpen
                ? "text-primary"
                : "text-fg-muted hover:text-fg",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-12 place-items-center rounded-full transition-colors",
                (isOverflowActive || isMoreOpen) && "bg-primary-soft",
              )}
            >
              <Ellipsis size={19} aria-hidden="true" />
            </span>
            More
          </button>
        )}
      </nav>

      <Sheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="More"
        description="The rest of the administration area."
      >
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {overflow.map(({ icon: Icon, label, to }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isActive
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                  )
                }
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
