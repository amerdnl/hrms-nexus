import { Check, ChevronDown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import type { ThemePreference } from "../../context/ThemeContext";
import { useAuth } from "../../context/useAuth";
import { useTheme } from "../../context/useTheme";
import { isPrimaryActive, primaryNavigationFor } from "../../routes/navigation";
import { roleDashboard } from "../../routes/roleDashboard";
import { cn } from "../../utils/cn";
import LogoutConfirmationModal from "../common/LogoutConfirmationModal";
import Avatar from "../ui/Avatar";
import DropdownMenu, { type MenuItem } from "../ui/DropdownMenu";
import CommandSearch from "../workplace/CommandSearch";
import NotificationBell from "../workplace/NotificationBell";
import AppLauncher from "./AppLauncher";
import BrandMark from "./BrandMark";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * The header, and the application's navigation from md up.
 *
 * It replaces the permanent sidebar, following the approved reference: the
 * identity at left, four persistent destinations beside it, and quiet
 * utilities at right - search, the App Launcher (every other module),
 * notifications and the account. What each destination means for this
 * session comes from the navigation registry; nothing here decides access.
 *
 * Sticky rather than fixed so it participates in normal flow and needs no
 * compensating padding on <main>.
 */
export default function AppHeader() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) return null;

  const homePath = roleDashboard(user.role);
  const primary = primaryNavigationFor(user);
  const name = user.employee?.fullName ?? "Administrator";
  // The second line says what the account is: a job title where there is
  // one, the email for an administrator account with no employee record
  // (whose name line already says "Administrator").
  const subline =
    user.role === "admin"
      ? user.employee ? "Administrator" : user.email
      : user.employee?.jobTitle ?? (user.isManager ? "Manager" : "Employee");
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

  const accountItems: MenuItem[] = [
    // The profile page is an employee route; an administrator has no employee
    // record to show, so the entry is simply absent for them.
    ...(user.role === "employee"
      ? [{ key: "profile", label: "My profile", icon: <UserRound size={16} aria-hidden="true" />, onSelect: () => navigate("/employee/profile") }]
      : []),
    // Theme lives here now that the sidebar footer is gone: one place at every
    // width, instead of a footer control on desktop and a header one on phones.
    ...THEME_OPTIONS.map((option) => ({
      key: `theme-${option.value}`,
      group: "Theme",
      label: option.label,
      icon: <option.icon size={16} aria-hidden="true" />,
      checked: preference === option.value,
      trailing: preference === option.value ? <Check size={15} className="text-primary" aria-hidden="true" /> : undefined,
      onSelect: () => setPreference(option.value),
    })),
    {
      key: "logout",
      label: "Sign out",
      icon: <LogOut size={16} aria-hidden="true" />,
      tone: "danger" as const,
      onSelect: () => setIsLogoutModalOpen(true),
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-header">
        <div className="flex h-16 items-center gap-3 px-(--gutter) md:h-[4.5rem] lg:gap-4">
          <BrandMark homePath={homePath} />

          <nav aria-label="Primary" className="ml-2 hidden md:block lg:ml-6 min-[90rem]:ml-12">
            <ul className="flex items-center gap-1 lg:gap-2">
              {primary.map((item) => {
                const active = isPrimaryActive(item, pathname);
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      aria-current={pathname === item.to ? "page" : active ? "true" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-2 rounded-full px-3.5 text-[0.9375rem] font-medium transition-colors lg:px-4",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        active ? "bg-primary-soft text-primary" : "text-fg hover:bg-surface-muted",
                      )}
                    >
                      <item.icon
                        size={19}
                        className="hidden shrink-0 lg:block"
                        // Home's house fills when active, as in the reference.
                        // Only Home: the other glyphs turn into blobs when
                        // filled, and the pill already marks the state.
                        fill={active && item.id === "home" ? "currentColor" : "none"}
                        aria-hidden="true"
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-1.5">
            <CommandSearch />
            <AppLauncher />
            <NotificationBell />
            <span aria-hidden="true" className="mx-1.5 hidden h-7 w-px bg-line lg:block" />

            <DropdownMenu
              label={`Account menu for ${name}`}
              align="end"
              className="shrink-0 gap-2 rounded-full py-1 pl-1 pr-1 lg:pr-2 min-[90rem]:gap-3 min-[90rem]:rounded-xl"
              trigger={
                <>
                  <Avatar name={name} src={profileImageUrl} size="md" />
                  <span className="hidden min-w-0 max-w-[11rem] text-left min-[90rem]:block">
                    <span className="block truncate text-sm font-semibold text-fg">{name}</span>
                    <span className="block truncate text-xs text-fg-subtle">{subline}</span>
                  </span>
                  <ChevronDown size={16} className="hidden text-fg-muted lg:block min-[90rem]:ml-4" aria-hidden="true" />
                </>
              }
              items={accountItems}
            />
          </div>
        </div>
      </header>

      <LogoutConfirmationModal
        isOpen={isLogoutModalOpen}
        isLoggingOut={isLoggingOut}
        onCancel={() => setIsLogoutModalOpen(false)}
        onConfirm={() => void handleLogout()}
      />
    </>
  );
}
