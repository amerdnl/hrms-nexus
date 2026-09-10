import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useTheme } from "../../context/useTheme";
import { navigationFor } from "../../routes/navigation";
import { cn } from "../../utils/cn";
import ThemeToggle from "../ui/ThemeToggle";

/*
 * The active item is a filled pill. It used to ALSO carry a 4px rail pinned to
 * the panel's left edge, as a second, non-colour cue. That was the right call
 * when the sidebar was dark chrome and the active state was close to a hue
 * change; against a light panel it reads as a stray tick rather than a rail,
 * and the references show no such mark. The cue is not lost: a filled pill
 * against a transparent row is itself a shape difference, and NavLink sets
 * aria-current regardless.
 */
const navigationItemBase =
  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors";

/**
 * The desktop sidebar.
 *
 * Desktop only. It used to double as a slide-out drawer below md, which is
 * why it carried a fixed hamburger, a backdrop, an open/closed transform and
 * `visibility: hidden` to keep its links out of the tab order while
 * off-screen. All of that is gone: below md, MobileNav is the navigation, and
 * `hidden` here means these links are genuinely not rendered rather than
 * merely pushed off-screen.
 *
 * The surface FOLLOWS the theme - light chrome in the light theme, navy in
 * the dark one - so nothing drawn on it may use a fixed colour. See the
 * --sidebar-* tokens in index.css.
 */
export default function Sidebar() {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();

  if (!user) return null;

  const navigation = navigationFor(user.role);
  const portalLabel = user.role === "admin" ? "Admin portal" : "Employee portal";

  return (
    <aside
      id="app-sidebar"
      aria-label="Sidebar"
      className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-sidebar text-sidebar-fg md:flex"
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-line px-6">
        {/* Follows the theme, because the sidebar does: the aqua mark is drawn
            for dark chrome and the teal one for light chrome.
            alt="" on purpose - the "HR NEXUS" wordmark sits right beside it,
            so naming the image would read the brand out twice. */}
        <img
          src={
            resolvedTheme === "dark"
              ? "/branding/hr-nexus-icon-light.png"
              : "/branding/hr-nexus-icon-transparent.png"
          }
          alt=""
          className="h-8 w-8 shrink-0 object-contain"
        />

        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide text-sidebar-fg-strong">
            HR NEXUS
          </p>
          <span className="mt-0.5 inline-flex items-center rounded-full bg-sidebar-badge-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-badge-fg">
            {portalLabel}
          </span>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
        {navigation.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                navigationItemBase,
                isActive
                  ? "bg-primary text-primary-fg"
                  : "hover:bg-sidebar-hover hover:text-sidebar-fg-strong",
              )
            }
          >
            <Icon size={19} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* The account block and sign-out used to live here. They moved to
          AppHeader, which the references show and which keeps them reachable
          on mobile now that this panel does not render there. */}
      <div className="border-t border-sidebar-line p-4">
        <ThemeToggle className="text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-strong" />
      </div>
    </aside>
  );
}
