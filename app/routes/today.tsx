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
  // rightSlot: "logout" as const, // optional if you want __app to render logout (otherwise AppShell defaults)
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
        // - 4-day: choose orderIndex=1 (simple MVP)
        // - 3-day: choose by currentDayIndex (0..3) -> orderIndex 1..4
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
    return <div className="text-sm text-zinc-300">Loading…</div>;
  }

  if (error) {
    return (
      <div>
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-200">
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

  return (
    <div>
      {/* No H1 here — AppShell top bar is your header now (prevents double header) */}
      <div className="mb-6 text-sm text-zinc-300">
        Week <span className="font-medium text-zinc-100">{weekNumber}</span> of 12
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Workout</h2>
              <p className="mt-1 text-sm text-zinc-300">
                {programDay ? programDay.dayLabel : "No workout found for this week/day."}
              </p>

              {programDay?.isDeload ? (
                <p className="mt-2 text-xs text-amber-300">
                  Deload week rules applied (reduced sets, higher RIR).
                </p>
              ) : null}
            </div>

            {programDay ? (
              <Link
                to={`/workout/${programDay.$id}`}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
              >
                Start / Log Workout
              </Link>
            ) : null}
          </div>

          {exercises.length ? (
            <div className="mt-4 space-y-2">
              {exercises.map((ex) => (
                <div
                  key={ex.$id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{ex.name}</div>
                    <div className="text-xs text-zinc-400">
                      {ex.sets}×{ex.repMin}–{ex.repMax} • target RIR {ex.rirTarget}
                      {ex.notes ? ` • ${ex.notes}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">Exercises will appear here.</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-base font-semibold">Nutrition Targets</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Calories:{" "}
            <span className="font-medium text-zinc-100">
              {program?.trainingDayCalories ?? 0}
            </span>{" "}
            (training) /{" "}
            <span className="font-medium text-zinc-100">
              {program?.restDayCalories ?? 0}
            </span>{" "}
            (rest)
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Protein target:{" "}
            <span className="font-medium text-zinc-100">
              {program?.proteinTarget ?? 0}g/day
            </span>
          </p>

          <p className="mt-3 text-xs text-zinc-400">
            Next: we’ll add the “log today’s macros” form + adherence score.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-base font-semibold">Cardio / Activity</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Steps goal:{" "}
            <span className="font-medium text-zinc-100">{program?.stepGoal ?? 10000}</span>
            /day
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Row Zone 2:{" "}
            <span className="font-medium text-zinc-100">
              {program?.rowSessionsPerWeek ?? 0}x/week
            </span>{" "}
            for{" "}
            <span className="font-medium text-zinc-100">{program?.rowMinutes ?? 0} min</span>
          </p>

          <p className="mt-3 text-xs text-zinc-400">
            Next: we’ll add “log today’s steps” + “log row session” buttons.
          </p>
        </div>
      </div>
    </div>
  );
}
