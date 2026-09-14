import { useLocation } from "react-router-dom";
import type { Crumb } from "../components/ui/Breadcrumbs";
import { useAuth } from "../context/useAuth";
import { breadcrumbsFor } from "../routes/breadcrumbs";
import { roleDashboard } from "../routes/roleDashboard";

/** The current page's trail, rooted at this session's Home. Empty on Home. */
export function useBreadcrumbs(): Crumb[] {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return [];
  return breadcrumbsFor(pathname, roleDashboard(user.role));
}
