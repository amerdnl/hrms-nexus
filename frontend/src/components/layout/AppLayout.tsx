import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { roleDashboard } from "../../routes/roleDashboard";
import { cn } from "../../utils/cn";
import { PageFallback } from "../common/RouteFallback";
import AppHeader from "./AppHeader";
import MobileNav from "./MobileNav";

/**
 * The authenticated shell: a header over the page, a quiet footer, and a
 * bottom bar below md.
 *
 * There is no sidebar. The header carries the four persistent destinations and
 * the App Launcher carries everything else, so the page has the full width.
 */
export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isHome = Boolean(user) && pathname === roleDashboard(user!.role);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* First focusable thing in the document, so a keyboard user can pass
          the header in one step. Visually hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-fg"
      >
        Skip to content
      </a>

      <AppHeader />

      {/* The gutter is a custom property (index.css) shared with the header.
          pb-28 below md clears the fixed bottom bar; md:pb-10 applies where
          that bar is not rendered. The two are coupled. */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-w-0 flex-1 px-(--gutter) pb-28 md:pb-10",
          isHome ? "pt-2 md:pt-4" : "pt-4 md:pt-6",
        )}
      >
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="mx-auto hidden w-full max-w-[calc(89rem+var(--gutter)*2)] items-center justify-between px-(--gutter) pb-7 text-xs text-fg-subtle md:flex">
        <p>
          <span className="font-medium tracking-[0.2em]">HR NEXUS</span>
          <span className="ml-3">V3</span>
        </p>
        <p className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px w-6 bg-line-strong" />
          Built for people, not just records.
        </p>
      </footer>

      <MobileNav />
    </div>
  );
}
