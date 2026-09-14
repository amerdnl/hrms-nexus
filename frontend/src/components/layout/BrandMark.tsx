import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";

/**
 * The mountain mark from the approved reference: a pale summit facet over two
 * darker flanks. Drawn rather than shipped as an image so it stays crisp at
 * any size and can take the dark theme's lighter colourway.
 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 30" className={className} aria-hidden="true" focusable="false">
      <path d="M20 1 29.5 15 20 22 10.5 15Z" className="fill-[#5fa894] dark:fill-[#86d4c2]" />
      <path d="M10.5 15 20 22V29H1Z" className="fill-[#0e4a42] dark:fill-[#3aa593]" />
      <path d="M29.5 15 39 29H20V22Z" className="fill-[#1b6457] dark:fill-[#2c8b7b]" />
    </svg>
  );
}

/**
 * The header identity: mark, wordmark and, where there is room, the tagline.
 * One link home, named once - the mark is decorative and the tagline is not
 * part of the name.
 */
export default function BrandMark({ homePath }: { homePath: string }) {
  return (
    <Link
      to={homePath}
      aria-label="HR Nexus home"
      className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <BrandGlyph className="h-7 w-9 shrink-0 lg:h-[1.875rem] lg:w-10" />
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight tracking-tight text-fg md:max-lg:sr-only lg:text-[1.375rem]">
          HR Nexus
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "hidden whitespace-nowrap text-[0.6875rem] leading-4 text-fg-subtle",
            "min-[90rem]:block",
          )}
        >
          People · Culture · A Brighter Tomorrow
        </span>
      </span>
    </Link>
  );
}
