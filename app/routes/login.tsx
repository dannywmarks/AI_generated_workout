// app/routes/login.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getCurrentUser, loginEmailPassword } from "~/services/auth.client";

export default function LoginRoute() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fun “random seed” for subtle background variation per load
  const seed = useMemo(() => Math.floor(Math.random() * 9999), []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) navigate("/app", { replace: true });
    })();
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await loginEmailPassword(email.trim(), password);
      navigate("/app", { replace: true });
    } catch (err: any) {
      console.error("[login] error:", err);
      setError(err?.message ?? "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Background: vignette + scanlines + subtle “pixel noise” */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18),rgba(0,0,0,0)_55%),radial-gradient(ellipse_at_bottom,rgba(0,0,0,0),rgba(0,0,0,0.9))]" />
        {/* scanlines */}
        <div className="absolute inset-0 opacity-[0.18] [background:repeating-linear-gradient(to_bottom,rgba(255,255,255,0.07)_0px,rgba(255,255,255,0.07)_1px,transparent_2px,transparent_6px)]" />
        {/* “noise” (deterministic-ish) */}
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${seed}'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.9'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-5xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              ARCADE AUTH // DAMAGE PLAN
            </div>

            <h1 className="mt-4 text-5xl font-extrabold tracking-tight">
              <span className="text-emerald-300 drop-shadow-[0_0_18px_rgba(16,185,129,0.35)]">
                LOGIN
              </span>
            </h1>
            <p className="mt-2 text-sm text-zinc-300">
              Enter credentials to access your 12-week program.
            </p>
          </div>

          {/* Terminal Card */}
          <form
            onSubmit={onSubmit}
            className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-zinc-900/40 p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_20px_60px_rgba(0,0,0,0.55)]"
          >
            {/* inner glow */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%)]" />

            {/* “terminal” title bar */}
            <div className="relative mb-5 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                <span className="tracking-wider">AUTH_CONSOLE</span>
              </div>
              <div className="text-[10px] text-zinc-500">
                STATUS: <span className="text-emerald-300">READY</span>
              </div>
            </div>

            <label className="relative block">
              <span className="text-xs tracking-wider text-zinc-300">
                EMAIL_ADDRESS
              </span>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                required
              />
            </label>

            <label className="relative mt-4 block">
              <span className="text-xs tracking-wider text-zinc-300">
                PASSCODE
              </span>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                required
              />
            </label>

            {error ? (
              <div className="relative mt-4 rounded-xl border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                <div className="text-xs tracking-wider text-red-300">
                  ERROR_CODE:
                </div>
                <div className="mt-1">{error}</div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="relative mt-6 space-y-3">
              <button
                type="submit"
                disabled={submitting}
                className="group relative w-full overflow-hidden rounded-xl border border-emerald-500/35 bg-emerald-600/20 px-4 py-3 text-sm font-semibold tracking-widest text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.18)] transition hover:bg-emerald-600/30 disabled:opacity-60"
              >
                {/* button shimmer */}
                <span className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                  <span className="absolute -inset-x-24 top-0 h-full rotate-12 bg-[linear-gradient(to_right,transparent,rgba(16,185,129,0.35),transparent)]" />
                </span>

                <span className="relative drop-shadow-[0_0_18px_rgba(16,185,129,0.35)]">
                  {submitting ? "AUTHENTICATING…" : "PRESS START"}
                </span>
              </button>

              <Link
                to="/"
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-center text-xs font-semibold tracking-widest text-zinc-300 transition hover:border-emerald-500/30 hover:text-emerald-200"
              >
                BACK TO TITLE
              </Link>

              <div className="pt-1 text-center text-xs text-zinc-400">
                No account?{" "}
                <Link
                  className="font-semibold tracking-wide text-emerald-300 hover:text-emerald-200"
                  to="/register"
                >
                  CREATE PLAYER
                </Link>
              </div>
            </div>
          </form>

          {/* tiny footer tip */}
          <div className="mt-6 text-center text-[11px] text-zinc-500">
            Tip: Use a strong passcode. Don’t reuse passwords.
          </div>
        </div>
      </div>
    </main>
  );
}
