// app/routes/register.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getCurrentUser, registerEmailPassword } from "~/services/auth.client";

export default function RegisterRoute() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await registerEmailPassword(email.trim(), password, name.trim() || undefined);
      navigate("/login", { replace: true });
    } catch (err: any) {
      console.error("[register] error:", err);
      setError(err?.message ?? "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Background: vignette + scanlines + subtle grid glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        {/* vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.10),rgba(0,0,0,0.85)_55%,rgba(0,0,0,1)_80%)]" />
        {/* scanlines */}
        <div className="absolute inset-0 opacity-30 [background:repeating-linear-gradient(to_bottom,rgba(255,255,255,0.06)_0px,rgba(255,255,255,0.06)_1px,transparent_2px,transparent_6px)]" />
        {/* faint noise */}
        <div className="absolute inset-0 opacity-[0.06] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22400%22 height=%22400%22 filter=%22url(%23n)%22 opacity=%220.4%22/%3E%3C/svg%3E')] bg-repeat" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16">
        {/* Top pill */}
        <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-emerald-900/50 bg-emerald-950/35 px-5 py-2 text-xs tracking-[0.2em] text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.10),0_0_30px_rgba(16,185,129,0.12)]">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.8)]" />
          <span>ARCADE AUTH // DAMAGE PLAN</span>
        </div>

        {/* Title */}
        <h1 className="text-center text-5xl font-extrabold tracking-tight text-emerald-300 drop-shadow-[0_0_18px_rgba(16,185,129,0.25)]">
          CREATE PLAYER
        </h1>
        <p className="mt-3 max-w-xl text-center text-base text-zinc-300">
          Register a new account to start your 12-week program.
        </p>

        {/* Console card */}
        <div className="mt-10 w-full max-w-xl rounded-3xl border border-emerald-900/40 bg-zinc-950/40 p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.10),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          {/* Console header bar */}
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-900/30 bg-zinc-950/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.7)]" />
              <span className="text-sm tracking-[0.2em] text-zinc-200">
                AUTH_CONSOLE
              </span>
            </div>
            <div className="text-xs tracking-[0.2em] text-zinc-400">
              STATUS: <span className="text-emerald-300">READY</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Name */}
            <label className="block">
              <span className="text-xs tracking-[0.2em] text-zinc-300">
                DISPLAY_NAME <span className="text-zinc-500">(OPTIONAL)</span>
              </span>
              <input
                className="mt-3 w-full rounded-2xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-600 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="DANNY"
                autoComplete="nickname"
              />
            </label>

            {/* Email */}
            <label className="block">
              <span className="text-xs tracking-[0.2em] text-zinc-300">
                EMAIL_ADDRESS
              </span>
              <input
                className="mt-3 w-full rounded-2xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-600 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                required
              />
            </label>

            {/* Password */}
            <label className="block">
              <span className="text-xs tracking-[0.2em] text-zinc-300">
                PASSCODE
              </span>
              <input
                className="mt-3 w-full rounded-2xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-600 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <p className="mt-2 text-xs text-zinc-500">
                Tip: Use at least 8 characters. Don&apos;t reuse passwords.
              </p>
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {/* Buttons */}
            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={submitting}
                className="group relative w-full rounded-2xl border border-emerald-700/40 bg-emerald-950/30 px-5 py-4 text-sm font-semibold tracking-[0.25em] text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_0_35px_rgba(16,185,129,0.10)] transition hover:bg-emerald-900/35 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_0_45px_rgba(16,185,129,0.16)] disabled:opacity-60"
              >
                {submitting ? "CREATING…" : "PRESS START"}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition group-hover:opacity-100 [background:radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.25),transparent_60%)]"
                />
              </button>

              <Link
                to="/"
                className="block w-full rounded-2xl border border-zinc-700/60 bg-zinc-950/35 px-5 py-4 text-center text-sm font-semibold tracking-[0.25em] text-zinc-200 transition hover:bg-zinc-900/40"
              >
                BACK TO TITLE
              </Link>

              <div className="pt-1 text-center text-sm text-zinc-300">
                Already a player?{" "}
                <Link
                  className="font-semibold tracking-[0.12em] text-emerald-300 hover:text-emerald-200"
                  to="/login"
                >
                  LOGIN
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
