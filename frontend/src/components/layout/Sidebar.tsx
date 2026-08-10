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
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import LogoutConfirmationModal from "../common/LogoutConfirmationModal";

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

  if (!user) return null;

  const name = user.employee?.fullName ?? (user.role === "admin" ? "Administrator" : "Employee");
  const navigation = user.role === "admin" ? adminNavigation : employeeNavigation;

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
        className="fixed left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white shadow-lg md:hidden"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open navigation"
      >
        <Menu size={21} />
      </button>

      {isOpen && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/50 md:hidden"
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-slate-200 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-6">
          <div>
            <p className="text-lg font-bold tracking-wide text-white">HR NEXUS</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-blue-400">People workspace</p>
          </div>
          <button className="text-slate-400 hover:text-white md:hidden" type="button" onClick={() => setIsOpen(false)} aria-label="Close navigation">
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
                `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-900 p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {getInitials(name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">{user.role}</p>
            </div>
          </div>
          <button className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-red-500/10 hover:text-red-300" type="button" onClick={() => setIsLogoutModalOpen(true)}>
            <LogOut size={18} /> Logout
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
