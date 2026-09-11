import { useTheme } from "../../context/useTheme";

/** The two colourways of the mark: teal on light surfaces, aqua on dark. */
const BRAND_ICON_ON_LIGHT = "/branding/hr-nexus-icon-transparent.png";
const BRAND_ICON_ON_DARK = "/branding/hr-nexus-icon-light.png";

/**
 * What every route shows while the session is being restored.
 *
 * Four routes each had their own - two said "Loading…", two "Restoring your
 * session…" - for the same wait. This is the one they share: the mark, gently
 * pulsing where motion is welcome, and a status message for assistive
 * technology as well as for sight.
 */
export default function SessionLoader() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div role="status" className="flex flex-col items-center gap-4">
        {/* alt="" - the message below is what this announces. */}
        <img
          src={resolvedTheme === "dark" ? BRAND_ICON_ON_DARK : BRAND_ICON_ON_LIGHT}
          alt=""
          className="h-10 w-10 object-contain motion-safe:animate-pulse"
        />
        <p className="text-sm font-medium text-fg-muted">Restoring your session…</p>
      </div>
    </div>
  );
}
