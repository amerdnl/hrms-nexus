import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { PageFallback } from "../common/RouteFallback";
import AppHeader from "./AppHeader";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-canvas md:flex">
      {/* First focusable thing in the document. With a persistent sidebar there
          was previously no way past eleven navigation links by keyboard.
          Visually hidden until focused rather than always on screen. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-fg"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />

        {/* pb-24 below md clears the fixed bottom navigation; md:pb-8 cancels
            it where that bar is not rendered. The two are coupled - changing
            one without the other hides the last row of a page behind the bar. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 md:p-8 md:pb-8 lg:p-10"
        >
          {/* The boundary for page chunks, inside the shell, so a first
              visit to a page keeps the navigation on screen. */}
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
