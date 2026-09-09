import { Camera, Loader2, MapPin, ScanLine, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkIn, checkOut, getVerificationStatus } from "../../api/attendanceApi";
import { getApiErrorMessage } from "../../api/axios";
import type {
  AttendanceRecord,
  AttendanceVerificationStatus,
  ReportedPosition,
} from "../../types/attendance";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import PrimaryButton from "../ui/PrimaryButton";
import SectionCard from "../ui/SectionCard";
import TextInput from "../ui/TextInput";

/** Minimal shape of the browser's built-in detector, where it exists. */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return typeof candidate === "function" ? candidate : null;
}

/**
 * Reads the device position once, only when an attendance action is taken.
 *
 * There is deliberately no watchPosition anywhere in the application: location is
 * requested for this action and for nothing else.
 */
function readPosition(): Promise<ReportedPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This device cannot report its location, so attendance cannot be verified."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (fix) =>
        resolve({
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          accuracyMeters: fix.coords.accuracy,
        }),
      (failure) => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow location access to record verified attendance.",
          2: "Your location is unavailable right now. Move somewhere with a clearer signal and try again.",
          3: "Finding your location took too long. Try again.",
        };
        reject(new Error(messages[failure.code] ?? "Your location could not be read."));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

interface VerifiedClockPanelProps {
  mode: "check-in" | "check-out";
  onRecorded: (record: AttendanceRecord) => void;
  onCancel: () => void;
}

export default function VerifiedClockPanel({
  mode, onRecorded, onCancel,
}: VerifiedClockPanelProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AttendanceVerificationStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const canScan = getBarcodeDetector() !== null && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    getVerificationStatus().then(setStatus).catch(() => setStatusFailed(true));
  }, []);

  const stopScanning = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  // The camera must never outlive the panel.
  useEffect(() => stopScanning, [stopScanning]);

  async function startScanning() {
    const Detector = getBarcodeDetector();
    if (!Detector) return;

    setScanError("");
    setScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          const value = found[0]?.rawValue;
          if (value) {
            setCode(value);
            stopScanning();
            return;
          }
        } catch {
          // A single unreadable frame is normal; keep looking.
        }
        frameRef.current = requestAnimationFrame(() => void tick());
      };
      frameRef.current = requestAnimationFrame(() => void tick());
    } catch {
      setScanError("The camera could not be opened. Type the code shown at the office instead.");
      stopScanning();
    }
  }

  async function submit() {
    setError("");

    if (!code.trim()) {
      setError("Scan the office QR code, or type the code shown beneath it.");
      return;
    }

    setBusy(true);
    try {
      // Location is read at the moment of submission, not held in advance.
      const position = await readPosition();
      const record = mode === "check-in"
        ? await checkIn(code.trim(), position)
        : await checkOut(code.trim(), position);
      stopScanning();
      onRecorded(record);
    } catch (requestError) {
      setError(
        requestError instanceof Error && !("response" in requestError)
          ? requestError.message
          : getApiErrorMessage(requestError, "Attendance could not be recorded."),
      );
    } finally {
      setBusy(false);
    }
  }

  const label = mode === "check-in" ? "Check in" : "Check out";

  return (
    <SectionCard
      title={`${label} with verification`}
      description="Scan the QR code displayed at the office. Your location is checked once, for this action only."
      icon={ShieldCheck}
    >
      <div className="space-y-4">
        {statusFailed && (
          <Alert tone="warning">
            Attendance settings could not be loaded. You can still try, but the office
            location may not be configured.
          </Alert>
        )}

        {status && !status.configured && (
          <Alert tone="danger" title="Verified attendance is not available yet">
            Your administrator has not set the office location in Company Settings.
            Attendance cannot be verified until they do.
          </Alert>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        {scanning ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-card border border-line bg-black">
              {/* muted + playsInline are required for autoplay on mobile Safari. */}
              <video
                ref={videoRef}
                className="mx-auto max-h-72 w-full object-contain"
                muted
                playsInline
                aria-label="Camera preview for scanning the office QR code"
              />
            </div>
            <Button variant="secondary" icon={X} onClick={stopScanning} fullWidth>
              Stop scanning
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {canScan ? (
              <Button
                variant="secondary"
                icon={Camera}
                onClick={() => void startScanning()}
                disabled={busy || status?.configured === false}
              >
                Scan QR code
              </Button>
            ) : (
              <p className="text-sm text-fg-muted">
                This browser cannot scan QR codes. Type the code shown beneath the QR
                at the office.
              </p>
            )}
          </div>
        )}

        {scanError && <Alert tone="warning">{scanError}</Alert>}

        <FormField
          id="attendance-code"
          label="Office code"
          hint="Scanned automatically, or type the code shown at the office."
        >
          <TextInput
            id="attendance-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. 3f9Kq2..."
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </FormField>

        <p className="flex items-start gap-2 text-xs text-fg-subtle">
          <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Your location is read once when you submit and is stored only as the
            distance and accuracy of this check. HR Nexus never tracks you in the
            background. QR and location checks make casual misuse harder, but they
            cannot prove who is holding a device.
          </span>
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => { stopScanning(); onCancel(); }} disabled={busy}>
            Cancel
          </Button>
          <PrimaryButton
            onClick={() => void submit()}
            isLoading={busy}
            loadingLabel="Verifying..."
            icon={busy ? Loader2 : ScanLine}
            disabled={status?.configured === false}
          >
            {label}
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}
