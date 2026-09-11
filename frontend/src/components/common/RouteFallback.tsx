import Skeleton, { SkeletonText } from "../ui/Skeleton";

/**
 * What a page shows while its own code chunk arrives.
 *
 * Every page is loaded on demand, so the first visit to each one waits for a
 * small download. This keeps the app shell - sidebar, header, bottom bar - in
 * place and draws the page's rough shape rather than blanking the screen, so a
 * slow network reads as "loading this page", not "the app broke".
 *
 * The status is announced once for assistive technology; the placeholders
 * themselves are hidden from it.
 */
export function PageFallback() {
  return (
    <section className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">Loading page</p>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="rounded-card border border-line bg-surface p-5 shadow-card" aria-hidden="true">
        <SkeletonText lines={5} />
      </div>
    </section>
  );
}

/**
 * The same wait for a screen that has no shell around it - sign-in and the
 * forced password change. A plain canvas rather than a skeleton: those screens
 * are one large image and a form, and a skeleton of either would flash.
 */
export function ScreenFallback() {
  return (
    <div className="min-h-dvh bg-canvas" aria-busy="true">
      <p role="status" className="sr-only">Loading</p>
    </div>
  );
}
