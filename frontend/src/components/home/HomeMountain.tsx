import mountainUrl from "../../assets/home-mountain.webp";
import { cn } from "../../utils/cn";

/**
 * The misty mountain beside the greeting, from the approved reference.
 *
 * Decorative throughout: aria-hidden, no pointer events, and the page means
 * the same without it. The image carries its own transparency (the haze was
 * keyed out against the canvas), so in the light theme it sits on the canvas
 * exactly as in the reference. In the dark theme the same image is used as a
 * mask over a pale blue-grey, so the range reads as a quiet silhouette on navy
 * instead of a light photograph pasted onto a dark page.
 */
export default function HomeMountain({ className, showWords = false }: { className?: string; showWords?: boolean }) {
  // The words and the haze belong to the wide composition, where the mountain
  // sits mid-page with canvas to its right. Beside the page edge the haze would
  // spill past the frame, so the other placements go without both.
  const mask = {
    maskImage: `url(${mountainUrl})`,
    WebkitMaskImage: `url(${mountainUrl})`,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  } as const;

  return (
    <div aria-hidden="true" className={cn("pointer-events-none select-none", className)}>
      <div className="relative aspect-[668/296] w-full">
        <img src={mountainUrl} alt="" width={668} height={296} decoding="async" className="absolute inset-0 size-full dark:hidden" />
        {/* The low sun on the right-hand ridge, restored as light rather than
            baked into the image, so it cannot turn into a white patch in dark. */}
        <div
          className="absolute right-[2%] top-[4%] h-[46%] w-[26%] dark:hidden"
          style={{ background: "radial-gradient(closest-side, rgb(250 232 204 / 0.7), rgb(250 232 204 / 0))" }}
        />
        <div
          className="absolute inset-0 hidden dark:block"
          style={{ ...mask, background: "linear-gradient(180deg, rgb(170 198 206 / 0.42), rgb(125 160 170 / 0.22))" }}
        />
        {/* A soft haze over the ridge's right edge, so it dissolves into the
            canvas. Centred in its box and fully transparent before the box's
            edges (closest-side), so no edge of the box can ever show. */}
        {showWords && <div
          className="absolute left-[74%] top-[18%] h-[82%] w-[52%] dark:hidden"
          style={{ background: "radial-gradient(closest-side, rgb(150 164 168 / 0.26), rgb(170 182 186 / 0.12) 55%, rgb(241 244 246 / 0))" }}
        />}
        {showWords && <div
          className="absolute left-[74%] top-[18%] hidden h-[82%] w-[52%] dark:block"
          style={{ background: "radial-gradient(closest-side, rgb(140 170 180 / 0.08), rgb(140 170 180 / 0))" }}
        />}
        {showWords && (
          <div className="absolute left-[76.4%] top-[45%] text-[0.875rem] font-light leading-[1.2rem] text-white/95 dark:text-[#cfe0e3]/80">
            <p>Better</p>
            <p>People</p>
            <p>Brighter</p>
            <p>Tomorrow</p>
            <span className="mt-4 block h-px w-[1.375rem] bg-white/80 dark:bg-[#cfe0e3]/60" />
          </div>
        )}
      </div>
    </div>
  );
}
