import buildingUrl from "../../assets/brand-building.webp";
import { cn } from "../../utils/cn";

/**
 * The architectural brand card from the approved reference: brand voice and
 * nothing else. It holds no control, so it cannot become a dead end, and it is
 * a figure with a name rather than a region, so it adds no landmark to skip.
 * The photograph is always dark; its colours are fixed, like the image.
 */
export default function BrandCard({ className }: { className?: string }) {
  return (
    <figure className={cn("relative isolate m-0 overflow-hidden rounded-card bg-[#0e1d1f] shadow-card", className)}>
      <img src={buildingUrl} alt="" width={283} height={302} decoding="async" className="absolute inset-0 -z-10 size-full object-cover object-right-top" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-[#0a1618]/75 via-[#0a1618]/25 to-transparent" />
      <figcaption className="flex h-full flex-col justify-end px-8 pb-6">
        <span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-[#7fd3bf]" />
        <p className="mt-6 text-[1.375rem] font-medium leading-[1.8rem] tracking-[-0.01em] text-white">
          A better
          <br />
          workplace,
          <br />
          together.
        </p>
        <p className="mt-9 text-[0.6875rem] font-medium tracking-[0.2em] text-white/85">HR NEXUS</p>
        <p className="mt-2.5 whitespace-nowrap text-[0.625rem] tracking-[0.12em] text-white/75 min-[90rem]:tracking-[0.2em]">PEOPLE · PROCESS · POSSIBILITY</p>
      </figcaption>
    </figure>
  );
}
