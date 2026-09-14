import { Check, ChevronDown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
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
 * network mark and letterspaced wordmark, four text destinations with a teal
 * underline on the current one, and quiet utilities - search, the App
 * Launcher, notifications and the account. What each destination means for
 * this session comes from the navigation registry; nothing here decides access.
 *
 * It sits directly on the canvas, as the reference does, and only takes a
 * surface and a hairline once the page scrolls beneath it.
 */
export default function AppHeader() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!user) return null;

  const homePath = roleDashboard(user.role);
  const primary = primaryNavigationFor(user);
  const name = user.employee?.fullName ?? "Administrator";
  // The second line says what the account is: its role for HR (as the
  // reference shows), a job title for everyone else.
  const subline =
    user.role === "admin"
      ? user.employee ? "Administrator" : "HR administrator"
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
    // One theme control at every width, in the account menu.
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
      <header
        className={cn(
          "sticky top-0 z-30 border-b transition-colors",
          isScrolled ? "border-line bg-header/95 backdrop-blur-sm" : "border-transparent bg-transparent",
        )}
      >
        <div className="relative mx-auto flex h-16 w-full max-w-[calc(89rem+var(--gutter)*2)] items-center gap-3 px-(--gutter) md:h-20 min-[80rem]:h-[5.1875rem]">
          <BrandMark homePath={homePath} />

          <nav aria-label="Primary" className="ml-8 hidden md:block lg:ml-14 xl:ml-[5.5rem]">
            <ul className="flex items-center gap-6 lg:gap-9 xl:gap-10">
              {primary.map((item) => {
                const active = isPrimaryActive(item, pathname);
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      aria-current={pathname === item.to ? "page" : active ? "true" : undefined}
                      className={cn(
                        "relative inline-flex h-10 items-center rounded-md text-[0.9375rem] transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
                        active ? "font-semibold text-fg" : "font-medium text-fg-muted hover:text-fg",
                      )}
                    >
                      {item.label}
                      {/* The current destination's mark: a teal rule with a
                          dot at its centre - a shape as well as a weight
                          change, so the state never rests on colour. */}
                      {active && (
                        <span aria-hidden="true" className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-primary">
                          <span className="absolute left-1/2 top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-2.5">
            <CommandSearch />
            <AppLauncher />
            <NotificationBell />

            <DropdownMenu
              label={`Account menu for ${name}`}
              align="end"
              className="ml-1 shrink-0 gap-3 rounded-full py-1 pl-1 pr-1 lg:ml-3 lg:pr-2 xl:rounded-xl"
              trigger={
                <>
                  <Avatar name={name} src={profileImageUrl} size="md" />
                  <span className="hidden min-w-0 max-w-[11rem] text-left xl:block">
                    <span className="block truncate text-sm font-semibold text-fg">{name}</span>
                    <span className="block truncate text-xs text-fg-subtle">{subline}</span>
                  </span>
                  <ChevronDown size={16} className="hidden text-fg-muted lg:block xl:ml-6" aria-hidden="true" />
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
