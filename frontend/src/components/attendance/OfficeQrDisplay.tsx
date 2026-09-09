import { QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { issueOfficeQr } from "../../api/attendanceApi";
import type { OfficeQrChallenge } from "../../types/attendance";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import SectionCard from "../ui/SectionCard";

/** Groups the code so it can be read aloud or typed from across a room. */
function groupCode(code: string): string {
  return (code.match(/.{1,6}/g) ?? [code]).join(" ");
}

/**
 * The office display. Codes are short-lived, so this reissues shortly before
 * expiry and keeps a live countdown; an employee always sees a valid code.
 */
export default function OfficeQrDisplay() {
  const [challenge, setChallenge] = useState<OfficeQrChallenge | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setActive(false);
    setChallenge(null);
    setSecondsLeft(0);
  }, []);

  const issue = useCallback(async () => {
    try {
      const next = await issueOfficeQr();
      setChallenge(next);
      setError("");
      return next;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to display a QR code."));
      setActive(false);
      return null;
    }
  }, []);

  // A single ticking effect owns both the countdown and the reissue, so the two
  // can never disagree about which code is on screen.
  useEffect(() => {
    if (!active || !challenge) return;

    const tick = () => {
      const remaining = Math.max(
        0, Math.round((Date.parse(challenge.expires_at) - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);

      // Reissue a moment before expiry so there is no dead gap on the display.
      if (remaining <= 3) {
        void issue();
        return;
      }
      timer.current = setTimeout(tick, 1000);
    };

    tick();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [active, challenge, issue]);

  useEffect(() => stop, [stop]);

  async function start() {
    setActive(true);
    if (!(await issue())) setActive(false);
  }

  return (
    <SectionCard
      title="Office attendance code"
      description="Display this where employees clock in. Each code lasts under a minute and refreshes itself."
      icon={QrCode}
      actions={
        active ? (
          <Button variant="secondary" size="sm" onClick={stop}>Hide code</Button>
        ) : (
          <Button variant="secondary" size="sm" icon={QrCode} onClick={() => void start()}>
            Show code
          </Button>
        )
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}

      {!active && !error && (
        <p className="text-sm text-fg-muted">
          Employees scan this code and share their location once, so attendance is
          checked against the office rather than taken on trust.
        </p>
      )}

      {active && challenge && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <img
            src={challenge.qr_svg}
            alt="Current office attendance QR code"
            className="h-56 w-56 shrink-0 rounded-card border border-line bg-white p-2"
          />

          <div className="min-w-0 space-y-3 text-center sm:text-left">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Or type this code
              </p>
              <p className="mt-1 break-all font-mono text-lg font-semibold text-fg">
                {groupCode(challenge.code)}
              </p>
            </div>

            <p className="flex items-center justify-center gap-2 text-sm text-fg-muted sm:justify-start">
              <RefreshCw size={15} aria-hidden="true" />
              {/* Announced politely so a countdown does not spam a screen reader. */}
              <span aria-live="polite">
                Refreshes in {secondsLeft} second{secondsLeft === 1 ? "" : "s"}
              </span>
            </p>

            <p className="text-xs text-fg-subtle">
              Employees must also be within {challenge.radius_meters} m of the office.
              A code can be used once per person, so a forwarded screenshot will not
              clock anyone in twice.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
