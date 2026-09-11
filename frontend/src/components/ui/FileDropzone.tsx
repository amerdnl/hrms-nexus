import { FileUp, LoaderCircle } from "lucide-react";
import { useState, type DragEvent, type Ref } from "react";
import { cn } from "../../utils/cn";

interface FileDropzoneProps {
  id: string;
  /** Passed to the native input, e.g. ".csv,.xlsx". */
  accept?: string;
  /** Plain-language description of what is accepted, shown in the zone. */
  constraints: string;
  disabled?: boolean;
  isBusy?: boolean;
  busyLabel?: string;
  onFile: (file: File) => void;
  /** React 19 accepts ref as a plain prop; callers reset the input through it. */
  ref?: Ref<HTMLInputElement>;
}

/**
 * A drop target built around a real <input type="file">.
 *
 * The native input is stretched invisibly over the whole zone rather than
 * hidden behind a styled button. That keeps everything the platform provides:
 * it is the tab stop, Enter and Space open the picker, a screen reader
 * announces it as a file control with its label, and a tap anywhere on the
 * zone opens the picker on a phone. The zone only adds drag-and-drop and the
 * visual frame, and shows focus by :focus-within on the real input.
 */
export default function FileDropzone({
  id,
  accept,
  constraints,
  disabled = false,
  isBusy = false,
  busyLabel = "Reading the file...",
  onFile,
  ref,
}: FileDropzoneProps) {
  const [isOver, setIsOver] = useState(false);
  const isInert = disabled || isBusy;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOver(false);
    if (isInert) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!isInert) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        isOver ? "border-primary bg-primary-soft" : "border-control-border bg-surface-muted",
        isInert ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary",
      )}
    >
      <span
        aria-hidden="true"
        className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-primary shadow-card"
      >
        {isBusy ? <LoaderCircle size={26} className="animate-spin" /> : <FileUp size={26} />}
      </span>

      <div aria-live="polite">
        <p className="text-sm font-semibold text-fg">
          {isBusy ? busyLabel : "Choose a file, or drop it here"}
        </p>
        {!isBusy && <p className="mt-1 text-xs text-fg-subtle">{constraints}</p>}
      </div>

      <span
        aria-hidden="true"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
      >
        Browse files
      </span>

      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        disabled={isInert}
        aria-describedby={`${id}-constraints`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
        // Covers the whole zone and is fully transparent, so the zone IS the
        // control. The outline is drawn by the zone via :focus-within.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span id={`${id}-constraints`} className="sr-only">
        {constraints}
      </span>
    </div>
  );
}
