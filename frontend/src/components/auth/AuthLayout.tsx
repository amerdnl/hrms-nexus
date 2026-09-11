import type { ReactNode } from "react";
import towersUrl from "../../assets/auth-towers.svg";
import ThemeToggle from "../ui/ThemeToggle";
import { cn } from "../../utils/cn";

/**
 * The aqua colourway of the mark. The hero is dark in both themes, so unlike
 * the app chrome it never needs the teal one.
 */
const BRAND_ICON_ON_DARK = "/branding/hr-nexus-icon-light.png";

interface AuthLayoutProps {
  children: ReactNode;
  /**
   * The two-line hero message. Sign-in carries it; the forced password change
   * does not, because a user who has to act first should not be sold to.
   */
  tagline?: boolean;
}

/**
 * The frame both authentication screens share.
 *
 * Two halves that deliberately do not match. The building is always dark - its
 * colours are fixed here rather than taken from theme tokens, so it stays the
 * same image in light and dark - while the form panel is the one surface that
 * follows the theme: white in light, navy in dark.
 *
 * Below lg the building becomes a band across the top and the form panel rises
 * over its foot, so a phone still gets the brand moment without the form
 * starting below the fold.
 */
export default function AuthLayout({ children, tagline = false }: AuthLayoutProps) {
  return (
    <main className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(30rem,1fr)]">
      <section
        className={cn(
          "relative isolate overflow-hidden bg-[#03080d] text-white",
          tagline ? "h-64 sm:h-72" : "h-40 sm:h-48",
          "lg:sticky lg:top-0 lg:h-dvh",
        )}
      >
        {/* Decorative: the page means the same without it. */}
        <img
          src={towersUrl}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_35%]"
        />
        {/* Two scrims, so the brand and the message sit on near-black whatever
            part of the facade is lit behind them: one rising from the foot,
            one from the left edge where the text starts. */}
        <div
          className="absolute inset-0 -z-10 bg-linear-to-t from-[#03080d] via-[#03080d]/55 via-45% to-[#03080d]/20"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 -z-10 hidden bg-linear-to-r from-[#03080d]/75 to-transparent to-70% lg:block"
          aria-hidden="true"
        />

        <div className="flex h-full flex-col justify-between p-6 pb-12 sm:p-8 sm:pb-14 lg:p-12 xl:p-14">
          <div className="flex items-center gap-3">
            {/* alt="" - the wordmark beside it announces the brand. */}
            <img src={BRAND_ICON_ON_DARK} alt="" className="h-9 w-9 shrink-0 object-contain" />
            <span className="text-lg font-bold tracking-[0.14em]">HR NEXUS</span>
          </div>

          {/* Styled as display type but marked up as text: the form panel owns
              the page's only <h1>. */}
          {tagline && (
            <div className="max-w-md">
              <p className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl xl:text-5xl">
                People build great workplaces.
              </p>
              <p className="mt-3 text-base text-white/75 sm:text-lg lg:mt-4">
                Manage people. Simplify work.
              </p>
            </div>
          )}
        </div>
      </section>

      <section
        className={cn(
          "relative -mt-6 flex flex-col rounded-t-[1.75rem] bg-surface px-5 pb-10 pt-4 sm:px-10",
          "lg:mt-0 lg:min-h-dvh lg:rounded-none lg:px-16 lg:py-8",
        )}
      >
        {/* On the themed panel in every layout, never over the building. */}
        <div className="flex justify-end">
          <ThemeToggle compact />
        </div>

        <div className="flex flex-1 items-start justify-center pt-2 lg:items-center lg:pt-0">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </section>
    </main>
  );
}
