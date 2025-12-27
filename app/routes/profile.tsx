// app/routes/profile.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router";
import { getCurrentUser } from "~/services/auth.client";

type User = any;

export default function ProfileRoute() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        setLoading(true);

        const u = await getCurrentUser();
        if (!u) {
          navigate("/login", { replace: true });
          return;
        }

        setUser(u);
        setLoading(false);
      } catch (e: any) {
        console.error("[profile] error:", e);
        setError(e?.message ?? "Failed to load profile.");
        setLoading(false);
      }
    })();
  }, [navigate]);

  const joined = useMemo(() => {
    if (!user?.$createdAt) return "—";
    try {
      return new Date(user.$createdAt).toLocaleString();
    } catch {
      return "—";
    }
  }, [user?.$createdAt]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="text-sm text-zinc-300">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200 shadow-[0_0_40px_rgba(16,185,129,0.08)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* CRT scanline + vignette overlay */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.10)_0%,rgba(0,0,0,0)_55%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background:repeating-linear-gradient(to_bottom,#fff_0px,#fff_1px,transparent_2px,transparent_6px)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.65)_100%)]" />
      </div>

      <div className="relative z-10">
        {/* Top pill header */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/30 px-4 py-2 text-xs tracking-[0.18em] text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
            PLAYER PROFILE // DAMAGE PLAN
          </div>

          <Link
            to="/today"
            className="rounded-full border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
          >
            BACK
          </Link>
        </div>

        {/* Title */}
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-emerald-300 drop-shadow-[0_0_18px_rgba(16,185,129,0.25)]">
          PROFILE
        </h1>
        <p className="mt-2 text-sm text-zinc-300">
          Account + preferences console.
        </p>

        {/* Main console card */}
        <section className="mt-8 rounded-2xl border border-emerald-700/30 bg-zinc-950/40 p-6 shadow-[0_0_60px_rgba(16,185,129,0.12)]">
          {/* Console header row */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.9)]" />
              <div className="text-sm tracking-[0.14em] text-zinc-100">
                PLAYER_CONSOLE
              </div>
            </div>
            <div className="text-xs tracking-[0.18em] text-zinc-400">
              STATUS:{" "}
              <span className="text-emerald-300">READY</span>
            </div>
          </div>

          {/* Body */}
          <div className="mt-6 grid grid-cols-1 gap-5">
            {/* Identity */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-5">
              <div className="text-xs tracking-[0.16em] text-zinc-400">
                SIGNED_IN_AS
              </div>

              <div className="mt-3 flex flex-col gap-1">
                <div className="text-2xl font-bold text-zinc-100">
                  {user?.name ?? "—"}
                </div>
                <div className="text-sm text-zinc-300">{user?.email ?? "—"}</div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ConsoleField
                  label="USER_ID"
                  value={user?.$id ? String(user.$id) : "—"}
                />
                <ConsoleField label="JOINED" value={joined} />
              </div>
            </div>

            {/* Preferences */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.16em] text-zinc-400">
                    PREFERENCES
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">
                    Coming next: units (lbs/kg), weekly schedule, notifications.
                  </div>
                </div>

                {/* little “slot” badge to match console feel */}
                <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/20 px-3 py-2 text-xs tracking-[0.16em] text-emerald-200">
                  MVP
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ConsoleField label="UNITS" value="LOCKED" hint="Coming soon" />
                <ConsoleField label="NOTIFICATIONS" value="LOCKED" hint="Coming soon" />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/today"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-700/40 bg-emerald-950/30 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.12)] hover:bg-emerald-950/45 sm:w-auto"
                >
                  BACK TO GAME
                </Link>

                <Link
                  to="/app"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/30 sm:w-auto"
                >
                  RETURN TO DASHBOARD
                </Link>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-zinc-500">
          Tip: Keep your passcode strong. Don’t reuse passwords.
        </p>
      </div>
    </main>
  );
}

function ConsoleField(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.06)]">
      <div className="text-xs tracking-[0.16em] text-zinc-400">{props.label}</div>
      <div className="mt-2 text-sm font-semibold text-zinc-100">{props.value}</div>
      {props.hint ? (
        <div className="mt-1 text-xs text-zinc-500">{props.hint}</div>
      ) : null}
    </div>
  );
}
