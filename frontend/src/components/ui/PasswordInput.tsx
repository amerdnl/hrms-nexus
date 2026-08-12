import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes, type Ref } from "react";
import { fieldClass } from "./fieldStyles";

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
  /** React 19 accepts ref as a plain prop; used for autofocus on modal open. */
  ref?: Ref<HTMLInputElement>;
}

export default function PasswordInput({
  invalid = false,
  className,
  ref,
  ...rest
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  const label = isVisible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <input
        ref={ref}
        type={isVisible ? "text" : "password"}
        // pr-11 reserves the toggle's footprint so long values never slide
        // underneath it. `pw-field` is the hook index.css uses to suppress
        // Edge's duplicate native reveal/clear controls.
        className={fieldClass(invalid, `pw-field pr-11 ${className ?? ""}`.trim())}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-fg-subtle transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        // aria-label because the control has no text, aria-pressed because it
        // is a toggle rather than a one-shot action.
        aria-label={label}
        aria-pressed={isVisible}
        title={label}
      >
        {isVisible ? (
          <EyeOff size={17} aria-hidden="true" />
        ) : (
          <Eye size={17} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
