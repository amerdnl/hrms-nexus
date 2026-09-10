import { Compass } from "lucide-react";
import { Navigate } from "react-router-dom";
import LinkButton from "../components/ui/LinkButton";
import { useAuth } from "../context/useAuth";
import { FORCED_PASSWORD_PATH } from "../routes/forcedPassword";
import { roleDashboard } from "../routes/roleDashboard";

/**
 * Shown for an address that matches no route.
 *
 * Previously "*" rendered HomeRedirect, so a typo landed silently on the
 * dashboard with no indication that the address was wrong. It now says so.
 *
 * The two redirects below are NOT cosmetic and must not be removed. HomeRedirect
 * was doing security work at this route: an account still holding a temporary
 * password must reach the forced-change screen from any address, and a signed
 * out visitor must reach the login page. A 404 that simply rendered would have
 * turned this route into the one place a flagged account could sit and look at
 * application chrome. The server refuses its requests regardless, but the
 * client should not offer the detour.
 */
export default function NotFoundPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-sm text-fg-muted">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword) {
    return <Navigate to={FORCED_PASSWORD_PATH} replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md text-center">
        <span
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"
          aria-hidden="true"
        >
          <Compass size={26} />
        </span>

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fg-subtle">
          Error 404
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-fg">
          That page does not exist
        </h1>

        <p className="mt-2 text-sm text-fg-muted">
          The address may have been mistyped, or the page may have been moved.
        </p>

        <LinkButton to={roleDashboard(user.role)} className="mt-6">
          Back to your dashboard
        </LinkButton>
      </div>
    </main>
  );
}
