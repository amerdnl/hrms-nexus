/**
 * What a personalised Home shows while its layout or its code arrives. Kept out
 * of the canvas chunk so the page can show it immediately, and laid out on the
 * canvas's own grid so nothing moves when the real widgets take its place.
 */
export default function DashboardSkeleton() {
  const tiles = ["h-[7.25rem]", "h-[7.25rem]", "h-[7.25rem]", "h-[7.25rem]", "h-60 sm:col-span-2", "h-60 sm:col-span-2"];
  return (
    <div aria-busy="true" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 min-[80rem]:gap-3">
      <span className="sr-only">Loading your Home</span>
      {tiles.map((tile, index) => (
        <div key={index} aria-hidden="true" className={`${tile} animate-pulse rounded-card border border-line bg-surface shadow-card motion-reduce:animate-none`} />
      ))}
    </div>
  );
}
