import { CalendarCheck, Clock3, LogIn, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import ThemeToggle from "../../components/ui/ThemeToggle";
import PasswordInput from "../../components/ui/PasswordInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import TextInput from "../../components/ui/TextInput";
import { useAuth } from "../../context/useAuth";
import { useTheme } from "../../context/useTheme";
import { FORCED_PASSWORD_PATH } from "../../routes/forcedPassword";
import { roleDashboard } from "../../routes/roleDashboard";

/**
 * Two colourways of one mark, same silhouette and alpha.
 *
 * The brand panel is dark chrome in both themes so it always takes the light
 * one. The compact header above the form sits on --canvas, which flips, so it
 * picks by resolved theme rather than being pinned to either.
 */
const BRAND_ICON_BLUE = "/branding/hr-nexus-icon-transparent.png";
const BRAND_ICON_LIGHT = "/branding/hr-nexus-icon-light.png";

/**
 * "Remember me" stores the email address only, so returning users do not
 * retype it. It is deliberately NOT part of the session: the JWT still lives
 * under AUTH_TOKEN_KEY and is written, read and cleared solely by
 * AuthProvider. Clearing this value never signs anyone out, and losing the
 * token never loses the prefill.
 */
const REMEMBERED_EMAIL_KEY = "hr_nexus_remembered_email";

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    // Safari private mode throws rather than returning null. A prefill is a
    // convenience, so an unavailable store just means an empty field.
    return "";
  }
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    // Failing to remember an email must never block a successful sign-in.
  }
}

const highlights = [
  { icon: Clock3, label: "Daily attendance, recorded in Malaysia time" },
  { icon: CalendarCheck, label: "Leave requests and approvals in one queue" },
  { icon: Users, label: "Employee and department records, always current" },
];

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState(readRememberedEmail);
  const [rememberMe, setRememberMe] = useState(() => readRememberedEmail() !== "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isLoading && isAuthenticated && user) {
    return (
      <Navigate
        to={user.mustChangePassword ? FORCED_PASSWORD_PATH : roleDashboard(user.role)}
        replace
      />
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      // Only on success, so a typo is never remembered. This runs before
      // navigate() because navigating unmounts this component.
      writeRememberedEmail(rememberMe ? email.trim() : null);
      // Sign-in succeeds for an account holding a temporary password; it simply
      // does not lead to the dashboard.
      navigate(
        signedIn.mustChangePassword ? FORCED_PASSWORD_PATH : roleDashboard(signedIn.role),
        { replace: true },
      );
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to sign in. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-screen bg-canvas lg:grid-cols-2">
      {/* Top-right in both layouts: below lg the form column is the whole
          page, and from lg it is the right-hand column, so this corner sits
          over --canvas either way rather than over the dark brand panel. */}
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle compact />
      </div>

      {/* Brand panel. Built on --sidebar so it reads as the same chrome as the
          app shell and stays intentional in both themes without a dark: pair
          on every child. Decoration is two flat layers - a low-opacity brand
          wash and one blurred bloom - rather than a full-bleed gradient. */}
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-fg lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-600/25 via-transparent to-accent-600/20"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          {/* Always the light variant: this panel is bg-sidebar in both
              themes. alt="" - the wordmark beside it announces the brand. */}
          <img
            src={BRAND_ICON_LIGHT}
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="text-lg font-bold tracking-wide text-sidebar-fg-strong">
            HR NEXUS
          </span>
        </div>

        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-300">
            One connected workplace
          </p>

          {/* Styled as a display heading but marked up as text: the form
              column owns the page's <h1> so the document still has one at
              viewports where this panel is display:none. */}
          <p className="mt-5 text-4xl font-bold leading-tight text-sidebar-fg-strong xl:text-5xl">
            People operations, made clearer.
          </p>

          <p className="mt-5 text-base leading-7 text-sidebar-fg">
            Securely access your employee information and HR tools from one place.
          </p>

          <ul className="mt-10 space-y-4">
            {highlights.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-3 text-sm text-sidebar-fg">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                  <Icon size={15} aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-fg">
          HR Nexus Employee Management System
        </p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-panel sm:p-9">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {/* This header sits on --canvas, which is light in the light
                theme and near-navy in the dark one, so the colourway follows
                the resolved theme instead of being fixed. */}
            <img
              src={resolvedTheme === "dark" ? BRAND_ICON_LIGHT : BRAND_ICON_BLUE}
              alt=""
              className="h-8 w-8 shrink-0 object-contain"
            />
            <span className="text-base font-bold tracking-wide text-fg">HR NEXUS</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-fg-muted">Sign in with your work account.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <FormField id="login-email" label="Email address" required>
              <TextInput
                id="login-email"
                className="min-h-11"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </FormField>

            <FormField id="login-password" label="Password" required>
              <PasswordInput
                id="login-password"
                className="min-h-11"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </FormField>

            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-fg-muted">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember my email
            </label>

            {error && <Alert tone="danger">{error}</Alert>}

            <PrimaryButton
              type="submit"
              fullWidth
              className="min-h-11"
              icon={LogIn}
              isLoading={isSubmitting}
              loadingLabel="Signing in…"
              disabled={isLoading}
            >
              Sign in
            </PrimaryButton>
          </form>
        </div>
      </section>
    </main>
  );
}
