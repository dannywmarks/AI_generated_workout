// app/routes/_index.tsx
import { Link } from "react-router";

export default function IndexRoute() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Recomp Tracker</h1>
        <p className="mt-3 text-zinc-300">
          12-week training + nutrition checklist tracker.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/app"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Go to App
          </Link>
          <Link
            to="/login"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
          >
            Login
          </Link>
          <Link
            to="/register"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-900"
          >
            Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}
