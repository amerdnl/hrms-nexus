import { Navigate, Outlet, useLocation } from "react-router-dom";
import SessionLoader from "../components/common/SessionLoader";
import { useAuth } from "../context/useAuth";
import type { UserRole } from "../types/auth";
import { FORCED_PASSWORD_PATH } from "./forcedPassword";
import { roleDashboard } from "./roleDashboard";

export default function ProtectedRoute({
  allowedRoles,
  requires,
}: {
  allowedRoles?: UserRole[];
  /**
   * A scope on top of the role. "manager" admits only an account someone
   * currently reports to. Convenience, like everything here: the team API
   * refuses anyone else whatever this component decides.
   */
  requires?: "manager";
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SessionLoader />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  /*
   * The routing lock, applied once for every protected page rather than per
   * route, and checked before the role check so an administrator is no more
   * exempt than an employee.
   *
   * This is convenience, not security. It exists so a flagged user sees the
   * right screen instead of a wall of failed requests; the server refuses these
   * routes whatever this component decides.
   */
  if (user.mustChangePassword) {
    return <Navigate to={FORCED_PASSWORD_PATH} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleDashboard(user.role)} replace />;
  }

  if (requires === "manager" && !user.isManager) {
    return <Navigate to={roleDashboard(user.role)} replace />;
  }

  return <Outlet />;
}
