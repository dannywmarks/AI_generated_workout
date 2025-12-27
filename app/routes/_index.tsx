// app/routes/_index.tsx
import { Link } from "react-router";

export default function IndexRoute() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(16,185,129,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,185,129,.35) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* CRT scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,.55) 0px, rgba(0,0,0,.55) 1px, transparent 2px, transparent 5px)",
        }}
      />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,.35)_55%,rgba(0,0,0,.7)_100%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-10">
        {/* “Screen” frame */}
        <div className="w-full rounded-2xl border border-emerald-400/20 bg-zinc-950/60 p-6 shadow-[0_0_0_1px_rgba(16,185,129,.08),0_0_50px_rgba(16,185,129,.10)] backdrop-blur">
          {/* Top tiny HUD */}
          <div className="mb-4 flex items-center justify-between text-[11px] tracking-widest text-emerald-200/80">
            <span className="uppercase">Damage Plan</span>
            <span className="uppercase">Recomp Tracker</span>
          </div>

          {/* Logo */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* glow behind logo */}
              <div className="absolute inset-0 -z-10 blur-2xl">
                <div className="mx-auto h-48 w-72 rounded-full bg-emerald-500/15" />
              </div>

              <img
                src="/damage_plan.png"
                alt="Damage Plan"
                className="w-[840px] max-w-[98vw] select-none [image-rendering:pixelated]"
                draggable={false}
              />
            </div>

            <p className="mt-5 text-center text-sm text-zinc-300">
              12-week training + nutrition checklist tracker.
            </p>

            {/* Blinking prompt */}
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/5 px-4 py-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold tracking-[0.25em] text-emerald-200/90">
                  PRESS START
                </span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-400">
                Use the menu below — (Enter) to select.
              </div>
            </div>
          </div>

          {/* Menu */}
          <div className="mt-8 grid gap-3">
            <MenuItem to="/login" label="LOGIN" hint="START" primary />
            <MenuItem to="/register" label="CREATE ACCOUNT" hint="A" />
            <MenuItem to="/app" label="GO TO APP" hint="B" subtle />
          </div>

          {/* Footer */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
                ⬅︎ ➡︎
              </span>
              <span>Navigate</span>
              <span className="ml-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
                ⏎
              </span>
              <span>Select</span>
            </div>
            <span className="uppercase tracking-widest">
              v1.0 • emerald mode
            </span>
          </div>
        </div>

        {/* Tiny copyright-ish line */}
        <div className="mt-6 text-center text-[10px] tracking-widest text-zinc-600">
          DAMAGE PLAN // TRAIN HARD // STAY CONSISTENT
        </div>
      </div>
    </main>
  );
}

function MenuItem(props: {
  to: string;
  label: string;
  hint?: string;
  primary?: boolean;
  subtle?: boolean;
}) {
  const { to, label, hint, primary, subtle } = props;

  const base =
    "group relative flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-400/40";
  const styles = primary
    ? "border-emerald-400/25 bg-emerald-500/10 hover:bg-emerald-500/14"
    : subtle
      ? "border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/40"
      : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/45";

  return (
    <Link to={to} className={`${base} ${styles}`}>
      {/* left: selector caret */}
      <div className="flex items-center gap-3">
        <span className="text-emerald-300/0 transition group-hover:text-emerald-300/90">
          ▶
        </span>
        <span className="text-sm font-semibold tracking-[0.2em]">{label}</span>
      </div>

      {/* right: “button” hint */}
      {hint ? (
        <span className="rounded-lg border border-emerald-400/20 bg-zinc-900/40 px-3 py-1 text-[11px] tracking-widest text-emerald-200/80">
          {hint}
        </span>
      ) : null}

      {/* glow on hover */}
      <span className="pointer-events-none absolute inset-0 rounded-xl opacity-0 shadow-[0_0_40px_rgba(16,185,129,.12)] transition group-hover:opacity-100" />
    </Link>
  );
}
