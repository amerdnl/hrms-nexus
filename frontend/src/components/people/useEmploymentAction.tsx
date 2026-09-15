import { UserCheck, UserMinus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { deleteEmployee, reactivateEmployee } from "../../api/employeeApi";
import ConfirmationModal from "../common/ConfirmationModal";

export interface EmploymentSubject {
  id: number;
  fullName: string;
  employmentStatus: string;
}

/** Active and probation are employed; any other status can be reactivated. */
export function isEmployed(status: string | null | undefined): boolean {
  return status === "active" || status === "probation";
}

type ActionType = "deactivate" | "reactivate";

const copy: Record<ActionType, {
  title: string;
  confirmLabel: string;
  processingLabel: string;
  tone: "danger" | "primary";
  icon: ReactNode;
  describe: (name: string) => string;
  done: (name: string) => string;
  failed: string;
}> = {
  deactivate: {
    title: "Deactivate employee?",
    confirmLabel: "Deactivate",
    processingLabel: "Deactivating...",
    tone: "danger",
    icon: <UserMinus size={21} />,
    describe: (name) =>
      `Are you sure you want to deactivate ${name}? Their attendance and leave history is kept, and their sign-in is disabled.`,
    done: (name) => `${name} is deactivated. Their history is kept.`,
    failed: "Unable to deactivate employee.",
  },
  reactivate: {
    title: "Reactivate employee?",
    confirmLabel: "Reactivate",
    processingLabel: "Reactivating...",
    // Not destructive, so this dialog is deliberately not red.
    tone: "primary",
    icon: <UserCheck size={21} />,
    describe: (name) =>
      `Are you sure you want to reactivate ${name}? Their sign-in is enabled again.`,
    done: (name) => `${name} is reactivated.`,
    failed: "Unable to reactivate employee.",
  },
};

/**
 * HR's deactivate and reactivate, confirmed in a dialog, for every page that
 * shows a person: the People directory's row menu and the shared profile.
 *
 * Deactivating is the existing DELETE /employees/:id, which the server carries
 * out as a status change - the record, its attendance, leave and payroll stay.
 * Nothing here removes a record. The server refuses both calls for anyone who
 * is not HR, whatever a page offers.
 */
export function useEmploymentAction(onChanged: () => void) {
  const [pending, setPending] = useState<{ type: ActionType; subject: EmploymentSubject } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function request(subject: EmploymentSubject) {
    setError("");
    setNotice("");
    setPending({ type: isEmployed(subject.employmentStatus) ? "deactivate" : "reactivate", subject });
  }

  async function confirm() {
    if (!pending) return;
    const { type, subject } = pending;
    setIsProcessing(true);
    try {
      if (type === "deactivate") await deleteEmployee(subject.id);
      else await reactivateEmployee(subject.id);
      setNotice(copy[type].done(subject.fullName));
      onChanged();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, copy[type].failed));
    } finally {
      setIsProcessing(false);
      setPending(null);
    }
  }

  const text = pending ? copy[pending.type] : null;

  const dialog = (
    <ConfirmationModal
      isOpen={pending !== null}
      isProcessing={isProcessing}
      title={text?.title ?? ""}
      description={pending && text ? text.describe(pending.subject.fullName) : ""}
      confirmLabel={text?.confirmLabel ?? ""}
      processingLabel={text?.processingLabel ?? ""}
      icon={text?.icon}
      tone={text?.tone}
      onCancel={() => {
        if (!isProcessing) setPending(null);
      }}
      onConfirm={() => void confirm()}
    />
  );

  return {
    request,
    dialog,
    error,
    notice,
    clearError: () => setError(""),
    clearNotice: () => setNotice(""),
  };
}
