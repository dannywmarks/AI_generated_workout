// app/routes/progress.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";
import { listNutritionLogs } from "~/services/nutritionLogs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_WORKOUT_LOGS = import.meta.env.VITE_COL_WORKOUT_LOGS as string;

function assertEnv() {
  if (!DB_ID || !COL_WORKOUT_LOGS) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_WORKOUT_LOGS");
  }
}

function isoDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

type WorkoutLog = any;
type NutritionLog = any;

export default function ProgressRoute() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [program, setProgram] = useState<any>(null);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [nutrition, setNutrition] = useState<NutritionLog[]>([]);

  const todayIso = useMemo(() => isoDate(new Date()), []);
  const start14Iso = useMemo(() => addDays(todayIso, -13), [todayIso]);

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

        // Workouts: last ~50 (filter locally)
        const w = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
          Query.equal("userId", user.$id),
          Query.equal("programId", active.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(50),
        ]);
        setWorkouts((w.documents ?? []) as any);

        // Nutrition: uses dateIso
        const n = await listNutritionLogs({
          programId: active.$id,
          startIso: start14Iso,
          limit: 30,
        });
        setNutrition(n as any);

        setLoading(false);
      } catch (e: any) {
        console.error("[progress] error:", e);
        setError(e?.message ?? "Failed to load progress.");
        setLoading(false);
      }
    })();
  }, [navigate, start14Iso]);

  const workoutCompleteCount = useMemo(() => {
    return workouts.filter((w) => String(w.status) === "complete").length;
  }, [workouts]);

  const avgCalories = useMemo(() => {
    const vals = nutrition
      .map((n) => (n.calories == null ? null : Number(n.calories)))
      .filter((x) => Number.isFinite(x as number)) as number[];
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.round(sum / vals.length);
  }, [nutrition]);

  const avgProtein = useMemo(() => {
    const vals = nutrition
      .map((n) => (n.protein == null ? null : Number(n.protein)))
      .filter((x) => Number.isFinite(x as number)) as number[];
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.round(sum / vals.length);
  }, [nutrition]);

  const rows = useMemo(() => {
    const byDate = new Map<string, NutritionLog>();
    for (const n of nutrition) {
      if (n.dateIso) byDate.set(String(n.dateIso), n);
    }

    const out: Array<{
      dateIso: string;
      calories?: number | null;
      protein?: number | null;
      carbs?: number | null;
      fats?: number | null;
    }> = [];

    for (let i = 13; i >= 0; i--) {
      const d = addDays(todayIso, -i);
      const n = byDate.get(d);
      out.push({
        dateIso: d,
        calories: n?.calories ?? null,
        protein: n?.protein ?? null,
        carbs: n?.carbs ?? null,
        fats: n?.fats ?? null,
      });
    }

    return out;
  }, [nutrition, todayIso]);

  if (loading) {
    return <div className="text-sm text-zinc-300">Loading…</div>;
  }

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Progress</h1>
          <p className="mt-1 text-sm text-zinc-300">Last 14 days (MVP)</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/nutrition"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
          >
            Log Nutrition
          </Link>
          <Link
            to="/today"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
          >
            Back
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="text-sm text-zinc-300">Workouts completed</div>
          <div className="mt-2 text-2xl font-semibold">{workoutCompleteCount}</div>
          <div className="mt-1 text-xs text-zinc-400">(From workout_logs status=complete)</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="text-sm text-zinc-300">Avg calories</div>
          <div className="mt-2 text-2xl font-semibold">{avgCalories ?? "—"}</div>
          <div className="mt-1 text-xs text-zinc-400">(From nutrition_logs)</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="text-sm text-zinc-300">Avg protein (g)</div>
          <div className="mt-2 text-2xl font-semibold">{avgProtein ?? "—"}</div>
          <div className="mt-1 text-xs text-zinc-400">
            Target: {Number(program?.proteinTarget ?? 0) || "—"}g/day
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">14-day Nutrition</h2>
          <Link className="text-sm text-emerald-400 hover:text-emerald-300" to="/nutrition">
            Log today →
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-zinc-400">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Calories</th>
                <th className="py-2 pr-3">Protein</th>
                <th className="py-2 pr-3">Carbs</th>
                <th className="py-2 pr-3">Fats</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dateIso} className="border-t border-zinc-800">
                  <td className="py-2 pr-3 text-zinc-300">{r.dateIso}</td>
                  <td className="py-2 pr-3">{r.calories ?? "—"}</td>
                  <td className="py-2 pr-3">{r.protein ?? "—"}</td>
                  <td className="py-2 pr-3">{r.carbs ?? "—"}</td>
                  <td className="py-2 pr-3">{r.fats ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-xs text-zinc-400">
            Next: add weekly rollups, weight trend (from checkins), and adherence scoring.
          </p>
        </div>
      </div>
    </div>
  );
}
