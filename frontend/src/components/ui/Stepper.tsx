import { Check } from "lucide-react";
import { cn } from "../../utils/cn";

export interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  /** Index of the step in progress. Earlier steps render as complete. */
  current: number;
  className?: string;
}

/**
 * Progress through a fixed sequence.
 *
 * An ordered list, because the order is the information. The current step
 * carries aria-current="step", and every step states its own status as text
 * for assistive tech, so progress is never conveyed by the tick or the colour
 * alone.
 *
 * Informational, not navigation: steps are not buttons. A workflow that lets
 * you jump back must offer that as a real control in its own content, where
 * it can explain what going back discards.
 */
export default function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0",
        className,
      )}
    >
      {steps.map((step, index) => {
        const state =
          index < current ? "complete" : index === current ? "current" : "upcoming";
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className="relative flex items-start gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
          >
            {/* Connector to the next step. Drawn from this step's centre so it
                spans exactly the gap; hidden on the last step and on phones,
                where the list is vertical. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] top-4 hidden h-0.5 rounded-full sm:block",
                  index < current ? "bg-primary" : "bg-line",
                )}
              />
            )}

            <span
              aria-hidden="true"
              className={cn(
                "relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors",
                state === "complete" && "bg-primary text-primary-fg",
                state === "current" &&
                  "bg-primary-soft text-primary ring-2 ring-primary ring-offset-2 ring-offset-surface",
                state === "upcoming" && "border border-control-border bg-surface text-fg-muted",
              )}
            >
              {state === "complete" ? <Check size={16} /> : index + 1}
            </span>

            <span className="min-w-0 sm:px-2">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  state === "upcoming" ? "text-fg-muted" : "text-fg",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {state === "complete"
                    ? " (complete)"
                    : state === "current"
                      ? " (current step)"
                      : " (not started)"}
                </span>
              </span>
              {step.description && (
                <span className="mt-0.5 block text-xs text-fg-subtle">
                  {step.description}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
