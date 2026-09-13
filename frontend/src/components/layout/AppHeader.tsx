import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import { breadcrumbsFor, pageTitleFor } from "../../routes/breadcrumbs";
import Avatar from "../ui/Avatar";
import Breadcrumbs from "../ui/Breadcrumbs";
import DropdownMenu from "../ui/DropdownMenu";
import ThemeToggle from "../ui/ThemeToggle";
import CommandSearch from "../workplace/CommandSearch";
import NotificationBell from "../workplace/NotificationBell";
import LogoutConfirmationModal from "../common/LogoutConfirmationModal";

/**
 * The persistent top bar.
 *
 * Sticky rather than fixed so it participates in normal flow and needs no
 * compensating padding on <main> - the coupling the old fixed hamburger
 * required, where changing one without the other overlapped the page heading.
 *
 * The account block lives here rather than in the sidebar footer, which is
 * where it used to be. Two reasons: the references put it here, and the
 * sidebar is about to stop existing below md, which would otherwise strand
 * sign-out on mobile.
 */
export default function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) return null;

  const name =
    user.employee?.fullName ??
    (user.role === "admin" ? "Administrator" : "Employee");
  const roleLabel = user.role === "admin" ? "Admin" : user.isManager ? "Manager" : "Employee";
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
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 md:px-8">
        {/* Below md the trail is replaced by the page's own name: three
            crumbs do not fit at 375px, and the bottom navigation already
            says which section you are in. */}
        <Breadcrumbs items={breadcrumbsFor(pathname)} className="hidden md:block" />
        <h2 className="truncate text-base font-semibold text-fg md:hidden">
          {pageTitleFor(pathname)}
        </h2>

        <div className="flex shrink-0 items-center gap-1">
          <CommandSearch />
          <NotificationBell />
          {/*
            The theme control's home is the sidebar footer, which the
            references show and which is where it stays from md up. But the
            sidebar does not render below md, so without this there is no way
            to change theme on a phone at all - the control went out with the
            drawer it used to live in. md:hidden, so the two never both show.
          */}
          <ThemeToggle
            compact
            className="text-fg-muted hover:bg-surface-muted hover:text-fg md:hidden"
          />

          <DropdownMenu
          label={`Account menu for ${name}`}
          align="end"
          className="shrink-0 gap-2 py-1 pl-1 pr-2"
          trigger={
            <>
              <Avatar name={name} src={profileImageUrl} size="sm" />
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-sm font-semibold text-fg">
                  {name}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </>
          }
          items={[
            // The profile page is an employee route; an administrator has no
            // employee record to show, so the entry is simply absent for them
            // rather than present and broken.
            ...(user.role === "employee"
              ? [
                  {
                    key: "profile",
                    label: "My profile",
                    icon: <UserRound size={16} aria-hidden="true" />,
                    onSelect: () => navigate("/employee/profile"),
                  },
                ]
              : []),
            {
              key: "logout",
              label: "Sign out",
              icon: <LogOut size={16} aria-hidden="true" />,
              tone: "danger" as const,
              onSelect: () => setIsLogoutModalOpen(true),
            },
          ]}
          />
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
