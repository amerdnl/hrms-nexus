import { LogOut } from "lucide-react";
import { useEffect, useRef } from "react";

interface LogoutConfirmationModalProps {
  isOpen: boolean;
  isLoggingOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmationModal({
  isOpen,
  isLoggingOut,
  onCancel,
  onConfirm,
}: LogoutConfirmationModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoggingOut) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isLoggingOut, isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4"
      role="presentation"
    >
      <section
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
      >
        <div className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600">
          <LogOut size={21} />
        </div>
        <h2
          id="logout-dialog-title"
          className="mt-4 text-xl font-bold text-slate-900"
        >
          Log out?
        </h2>
        <p
          id="logout-dialog-description"
          className="mt-2 text-sm text-slate-500"
        >
          Are you sure you want to log out of HR Nexus?
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </section>
    </div>
  );
}
