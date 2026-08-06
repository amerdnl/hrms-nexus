import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import { roleDashboard } from "../../routes/roleDashboard";

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isLoading && isAuthenticated && user) {
    return <Navigate to={roleDashboard(user.role)} replace />;
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
      const role = await login(email.trim(), password);
      navigate(roleDashboard(role), { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to sign in. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-2">
      <section className="hidden bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="text-2xl font-bold tracking-tight">HR NEXUS</div>
        <div className="max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">
            One connected workplace
          </p>
          <h1 className="mt-4 text-5xl font-bold leading-tight">
            People operations, made clearer.
          </h1>
          <p className="mt-5 text-lg leading-8 text-blue-100">
            Securely access your employee information and HR tools from one place.
          </p>
        </div>
        <p className="text-sm text-blue-200">HR Nexus Employee Management System</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl shadow-slate-200/70 sm:p-10">
          <div className="mb-8 lg:hidden">
            <span className="text-xl font-bold text-blue-700">HR NEXUS</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500">Sign in with your work account.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block text-sm font-semibold text-slate-700">
              Email address
              <input
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Password
              <span className="relative mt-2 block">
                <input
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 hover:text-slate-800"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting || isLoading}
            >
              <LogIn size={19} />
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
