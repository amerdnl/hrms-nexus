import {
  Building2,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import { cn } from "../../utils/cn";
import LogoutConfirmationModal from "../common/LogoutConfirmationModal";
import ThemeToggle from "../ui/ThemeToggle";

interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const adminNavigation: NavigationItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Employees", to: "/admin/employees", icon: Users },
  { label: "Departments", to: "/admin/departments", icon: Building2 },
  { label: "Attendance", to: "/admin/attendance", icon: Clock3 },
  { label: "Leave", to: "/admin/leave", icon: CalendarDays },
];

const employeeNavigation: NavigationItem[] = [
  { label: "Dashboard", to: "/employee/dashboard", icon: LayoutDashboard },
  { label: "Profile", to: "/employee/profile", icon: UserRound },
  { label: "Attendance", to: "/employee/attendance", icon: Clock3 },
  { label: "Leave", to: "/employee/leave", icon: CalendarDays },
];

const navigationItemBase =
  "relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition";

/* The sidebar is a permanently dark surface in BOTH themes, so it uses the
   dedicated --sidebar* tokens plus the static brand ramp. Theme-flipping
   tokens are deliberately avoided for text here: --danger, for example, is
   tuned for the page background and only reaches 4.06:1 on the light-theme
   sidebar, so the logout hover keeps a fixed light red instead. */
/**
 * `visibility` is doing accessibility work here, not decoration.
 *
 * A drawer that is merely translated off-screen keeps its links in the tab
 * order, so a keyboard user below `md` tabs through five invisible
 * destinations. `visibility: hidden` removes them from both the tab order and
 * the accessibility tree, and `md:visible` re-exposes them at the breakpoint
 * where the sidebar is permanently on screen - so desktop is untouched.
 *
 * visibility is included in the transition because it interpolates discretely:
 * on open it flips to visible immediately, on close it waits for the slide-out
 * to finish instead of making the panel vanish.
 */
const sidebarPanel =
  "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-fg transition-[transform,visibility] md:sticky md:top-0 md:h-screen md:translate-x-0 md:visible";

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [user?.employee?.profileImage]);

  if (!user) return null;

  const name = user.employee?.fullName ?? (user.role === "admin" ? "Administrator" : "Employee");
  const navigation = user.role === "admin" ? adminNavigation : employeeNavigation;
  const portalLabel = user.role === "admin" ? "Admin portal" : "Employee portal";
  const profileImageUrl = resolveProfileImageUrl(user.employee?.profileImage ?? null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
    }
  };

  return (
    <>
      <button
        className="fixed left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-lg bg-sidebar text-sidebar-fg-strong shadow-raised md:hidden"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open navigation"
        aria-expanded={isOpen}
        aria-controls="app-sidebar"
      >
        <Menu size={21} />
      </button>

      {isOpen && (
        <button
          className="fixed inset-0 z-40 bg-backdrop md:hidden"
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        className={cn(
          sidebarPanel,
          isOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between gap-3 border-b border-sidebar-line px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black tracking-tight text-primary-fg"
              aria-hidden="true"
            >
              HN
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-wide text-sidebar-fg-strong">
                HR NEXUS
              </p>
              <span className="mt-0.5 inline-flex items-center rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300">
                {portalLabel}
              </span>
            </div>
          </div>

          <button
            className="shrink-0 rounded-lg p-1 text-sidebar-fg transition hover:text-sidebar-fg-strong md:hidden"
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          {navigation.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                cn(
                  navigationItemBase,
                  isActive
                    ? "bg-primary text-primary-fg"
                    : "hover:bg-sidebar-hover hover:text-sidebar-fg-strong",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Shape, not just hue: the active item also carries a rail
                      flush with the sidebar edge. NavLink sets aria-current
                      itself, so assistive tech is covered separately. */}
                  {isActive && (
                    <span
                      className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-line p-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-sidebar-hover p-3">
            {profileImageUrl && !profileImageFailed ? (
              <img
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                src={profileImageUrl}
                alt=""
                onError={() => setProfileImageFailed(true)}
              />
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-fg">
                {getInitials(name)}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-fg-strong">{name}</p>
              <p className="truncate text-xs text-sidebar-fg">{user.email}</p>
            </div>
          </div>

          <ThemeToggle className="text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-strong" />

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-sidebar-fg transition hover:bg-red-500/10 hover:text-red-300"
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
          >
            <LogOut size={18} aria-hidden="true" /> Logout
          </button>
        </div>
      </aside>

      <LogoutConfirmationModal
        isOpen={isLogoutModalOpen}
        isLoggingOut={isLoggingOut}
        onCancel={() => setIsLogoutModalOpen(false)}
        onConfirm={() => void handleLogout()}
      />
    </>
  );
}
