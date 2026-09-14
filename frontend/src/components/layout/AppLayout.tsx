import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { roleDashboard } from "../../routes/roleDashboard";
import { cn } from "../../utils/cn";
import { PageFallback } from "../common/RouteFallback";
import AppHeader from "./AppHeader";
import MobileNav from "./MobileNav";

/**
 * The authenticated shell: a header over the page, and a bottom bar below md.
 *
 * There is no sidebar. The header carries the four persistent destinations and
 * the App Launcher carries everything else, so the page gets the full width -
 * which is what lets Home run its hero edge to edge as the reference does.
 */
export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isHome = Boolean(user) && pathname === roleDashboard(user!.role);

  return (
    <div className="min-h-screen bg-canvas">
      {/* First focusable thing in the document, so a keyboard user can pass
          the header's destinations and utilities in one step. Visually hidden
          until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-fg"
      >
        Skip to content
      </a>

      <AppHeader />

      {/* The gutter is a custom property (index.css) so Home's hero can cancel
          exactly the padding it sits in. pb-28 below md clears the fixed
          bottom bar; md:pb-12 applies where that bar is not rendered. The two
          are coupled - changing one without the other hides the last row of a
          page behind the bar. */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-w-0 px-(--gutter) pb-28 md:pb-12",
          isHome ? "pt-0" : "pt-5 md:pt-7",
        )}
      >
        {/* The boundary for page chunks, inside the shell, so a first visit to
            a page keeps the header on screen. */}
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <MobileNav />
    </div>
  );
}
