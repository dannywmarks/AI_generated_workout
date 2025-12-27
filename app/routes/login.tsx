// app/routes/login.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getCurrentUser, loginEmailPassword } from "~/services/auth.client";

export default function LoginRoute() {
  const navigate = useNavigate();

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
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Sign in to access your 12-week program.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6"
        >
          <label className="block">
            <span className="text-sm text-zinc-300">Email</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-300">Password</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-center text-sm text-zinc-300">
            No account?{" "}
            <Link className="text-emerald-400 hover:text-emerald-300" to="/register">
              Create one
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
