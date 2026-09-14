import type { ReactNode } from "react";
import { greetingWord } from "./homeTime";

/**
 * Home's greeting in the reference's hierarchy: a quiet letterspaced time of
 * day, the welcome as the page's only heading, two lines of supporting copy,
 * and the one primary action.
 */
export default function HomeGreeting({ name, lines, action }: { name: string | null; lines: [string, string]; action?: ReactNode }) {
  return (
    <div className="relative">
      <p className="text-[0.8125rem] font-medium uppercase tracking-[0.2em] text-fg-subtle">{greetingWord()}</p>
      <h1 className="mt-1.5 text-[2.125rem] font-semibold leading-[1.12] tracking-[-0.02em] text-fg sm:text-[2.5rem] lg:text-[3rem]">
        {name ? `Welcome back, ${name}.` : "Welcome back."}
      </h1>
      <p className="mt-3 text-[0.9375rem] leading-5 text-fg-subtle">
        {lines[0]}
        <br />
        {lines[1]}
      </p>
      {action && <div className="mt-5 min-[80rem]:mt-7">{action}</div>}
    </div>
  );
}
