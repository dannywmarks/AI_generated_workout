// app/routes/today.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_PROGRAM_DAYS = import.meta.env.VITE_COL_PROGRAM_DAYS as string;
const COL_PROGRAM_EXERCISES = import.meta.env.VITE_COL_PROGRAM_EXERCISES as string;

function assertEnv() {
  if (!DB_ID || !COL_PROGRAM_DAYS || !COL_PROGRAM_EXERCISES) {
    throw new Error("[ENV] Missing database/program_days/program_exercises env vars");
  }
}

// Accepts "YYYY-MM-DD" OR full ISO, returns week 1..12
function diffWeeksSafe(startIso: string) {
  const datePart = String(startIso).slice(0, 10); // "YYYY-MM-DD"
  const start = new Date(`${datePart}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    throw new Error(`[today] Invalid program.startDate format: ${JSON.stringify(startIso)}`);
  }

  const now = new Date();
  const ms = now.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const wk = Math.floor(days / 7) + 1;
  return Math.min(12, Math.max(1, wk));
}

type ProgramDay = any;
type ProgramExercise = any;

// This feeds __app.tsx -> AppShell (prevents double headers)
export const handle = {
  title: "Today",
  subtitle: "Damage Plan",
};

export default function TodayRoute() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<any>(null);
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [programDay, setProgramDay] = useState<ProgramDay | null>(null);
  const [exercises, setExercises] = useState<ProgramExercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assertEnv();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const user = await getCurrentUser();
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const active = await getActiveProgram();
        if (!active) {
          navigate("/onboarding", { replace: true });
          return;
        }

        setProgram(active);

        const wk = active?.startDate ? diffWeeksSafe(active.startDate) : 1;
        setWeekNumber(wk);

        // pick today's program day:
        const isThreeDay = Number(active.daysPerWeek) === 3;
        const currentIdx = Number(active.currentDayIndex ?? 0);
        const targetOrder = isThreeDay ? currentIdx + 1 : 1;

        if (!Number.isInteger(targetOrder) || targetOrder < 1 || targetOrder > 4) {
          throw new Error(`[today] Invalid targetOrder computed: ${targetOrder}`);
        }

        const daysRes = await databases.listDocuments(DB_ID, COL_PROGRAM_DAYS, [
          Query.equal("programId", active.$id),
          Query.equal("weekNumber", wk),
          Query.equal("orderIndex", targetOrder),
          Query.limit(1),
        ]);

        const day = (daysRes.documents?.[0] as any) ?? null;
        setProgramDay(day);

        if (!day) {
          setExercises([]);
          setLoading(false);
          return;
        }

        const exRes = await databases.listDocuments(DB_ID, COL_PROGRAM_EXERCISES, [
          Query.equal("programDayId", day.$id),
          Query.orderAsc("orderIndex"),
          Query.limit(100),
        ]);

        setExercises(exRes.documents as any);
        setLoading(false);
      } catch (e: any) {
        console.error("[today] error:", e);
        setError(e?.message ?? "Failed to load today.");
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) {
    return (
      <div className="relative">
        <ArcadeBackdrop />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-300">
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative">
        <ArcadeBackdrop />
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-red-200">
          {error}
        </div>

        <div className="mt-6">
          <Link className="text-emerald-400 hover:text-emerald-300" to="/app">
            Back to Gate
          </Link>
        </div>
      </div>
    );
  }

  const status = programDay ? "READY" : "NO_DAY";
  const dayLabel = programDay?.dayLabel ?? "No workout found for this week/day.";

  return (
    <div className="relative">
      <ArcadeBackdrop />

      {/* HUD / Console strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/60 bg-emerald-950/30 px-3 py-1 text-[11px] tracking-widest text-emerald-200/90 shadow-[0_0_40px_rgba(16,185,129,0.08)]">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.8)]" />
          TODAY_MODULE // DAMAGE PLAN
        </div>

        <div className="flex items-center gap-3 text-[11px] tracking-widest text-zinc-400">
          <span className="rounded-full border border-zinc-800 bg-zinc-950/40 px-3 py-1">
            WEEK <span className="text-zinc-100">{weekNumber}</span>/12
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-950/40 px-3 py-1">
            STATUS:{" "}
            <span className={status === "READY" ? "text-emerald-300" : "text-amber-300"}>
              {status}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* WORKOUT PANEL */}
        <section className="relative overflow-hidden rounded-2xl border border-emerald-900/50 bg-zinc-900/35 p-5 shadow-[0_0_80px_rgba(16,185,129,0.08)]">
          <PanelGlow />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/35 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.75)]" />
                  <div className="text-xs tracking-widest text-zinc-200/90">
                    WORKOUT_CONSOLE
                  </div>
                </div>
                <div className="text-xs tracking-widest text-zinc-400">
                  MODE:{" "}
                  <span className="text-zinc-200">
                    {programDay?.isDeload ? "DELOAD" : "NORMAL"}
                  </span>
                </div>
              </div>

              <div className="text-sm tracking-widest text-zinc-400">TODAY_LOADOUT</div>
              <div className="mt-2 text-xl font-semibold text-emerald-200">
                {dayLabel}
              </div>

              {programDay?.isDeload ? (
                <p className="mt-3 text-xs text-amber-300">
                  Deload rules applied (reduced sets, higher RIR).
                </p>
              ) : null}
            </div>

            {programDay ? (
              <Link
                to={`/workout/${programDay.$id}`}
                className="group inline-flex items-center justify-center rounded-xl border border-emerald-900/60 bg-emerald-950/35 px-4 py-3 text-sm font-semibold tracking-widest text-emerald-200 shadow-[0_0_40px_rgba(16,185,129,0.12)] transition hover:bg-emerald-900/20 hover:text-emerald-100"
              >
                PRESS START
                <span className="ml-2 opacity-70 group-hover:opacity-100">▶</span>
              </Link>
            ) : null}
          </div>

          {/* exercise list */}
          <div className="mt-5">
            {exercises.length ? (
              <div className="space-y-2">
                {exercises.map((ex, idx) => (
                  <div
                    key={ex.$id}
                    className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-950/35 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-100">
                          <span className="mr-2 text-xs tracking-widest text-emerald-300/80">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          {ex.name}
                        </div>
                        <div className="mt-1 text-xs tracking-wide text-zinc-400">
                          {ex.sets}×{ex.repMin}–{ex.repMax} • TARGET RIR{" "}
                          <span className="text-zinc-200">{ex.rirTarget}</span>
                          {ex.notes ? (
                            <>
                              {" "}
                              • <span className="text-zinc-300">{ex.notes}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <span className="rounded-full border border-zinc-800 bg-zinc-900/30 px-3 py-1 text-[11px] tracking-widest text-zinc-300">
                        QUEUED
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Exercises will appear here.</p>
            )}
          </div>
        </section>

        {/* NUTRITION PANEL */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5">
          <PanelGlow subtle />

          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/35 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400/90 shadow-[0_0_18px_rgba(16,185,129,0.6)]" />
              <div className="text-xs tracking-widest text-zinc-200/90">
                NUTRITION_CONSOLE
              </div>
            </div>
            <div className="text-xs tracking-widest text-zinc-400">STATUS: READY</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="TRAINING_CAL" value={String(program?.trainingDayCalories ?? 0)} />
            <Stat label="REST_CAL" value={String(program?.restDayCalories ?? 0)} />
            <Stat label="PROTEIN_G" value={String(program?.proteinTarget ?? 0)} />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Next: add “log macros” + adherence score.
          </p>
        </section>

        {/* ACTIVITY PANEL */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5">
          <PanelGlow subtle />

          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/35 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400/90 shadow-[0_0_18px_rgba(16,185,129,0.6)]" />
              <div className="text-xs tracking-widest text-zinc-200/90">
                ACTIVITY_CONSOLE
              </div>
            </div>
            <div className="text-xs tracking-widest text-zinc-400">STATUS: READY</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="STEPS_GOAL" value={String(program?.stepGoal ?? 10000)} />
            <Stat label="Z2_SESSIONS" value={String(program?.rowSessionsPerWeek ?? 0)} />
            <Stat label="Z2_MIN" value={String(program?.rowMinutes ?? 0)} />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Next: add “log steps” + “log row session” actions.
          </p>
        </section>
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 px-4 py-3">
      <div className="text-[11px] tracking-widest text-zinc-400">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{props.value}</div>
    </div>
  );
}

function PanelGlow(props: { subtle?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-0",
        props.subtle
          ? "opacity-40"
          : "opacity-70",
      ].join(" ")}
    >
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent" />
    </div>
  );
}

function ArcadeBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.10),transparent_55%)]" />
      {/* scanlines */}
      <div className="absolute inset-0 opacity-[0.10] [background:repeating-linear-gradient(to_bottom,rgba(255,255,255,0.06)_0px,rgba(255,255,255,0.06)_1px,transparent_2px,transparent_6px)]" />
      {/* subtle noise-ish grid */}
      <div className="absolute inset-0 opacity-[0.06] [background:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
    </div>
  );
}
