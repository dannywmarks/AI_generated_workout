// app/routes/nutrition.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";
import {
  getOrCreateNutritionLog,
  updateNutritionLog,
  isoDate,
} from "~/services/nutritionLogs.client";

export const handle = {
  title: "Nutrition",
  subtitle: "Log calories & macros",
};

function toNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function NutritionRoute() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [program, setProgram] = useState<any>(null);
  const [logId, setLogId] = useState<string | null>(null);

  const [dateIso, setDateIso] = useState<string>(isoDate(new Date()));
  const [calories, setCalories] = useState<string>("");
  const [protein, setProtein] = useState<string>("");
  const [carbs, setCarbs] = useState<string>("");
  const [fats, setFats] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const calorieTarget = useMemo(() => {
    // MVP: assume training day target
    return Number(program?.trainingDayCalories ?? 0);
  }, [program]);

  const proteinTarget = useMemo(() => Number(program?.proteinTarget ?? 0), [program]);

  useEffect(() => {
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

        const log = await getOrCreateNutritionLog({
          programId: active.$id,
          dateIso,
        });

        setLogId(log.$id);
        setCalories(log.calories != null ? String(log.calories) : "");
        setProtein(log.protein != null ? String(log.protein) : "");
        setCarbs(log.carbs != null ? String(log.carbs) : "");
        setFats(log.fats != null ? String(log.fats) : "");
        setNotes(log.notes ?? "");

        setLoading(false);
      } catch (e: any) {
        console.error("[nutrition] error:", e);
        setError(e?.message ?? "Failed to load nutrition.");
        setLoading(false);
      }
    })();
  }, [navigate, dateIso]);

  async function onSave() {
    if (!logId) return;
    setSaving(true);
    setError(null);

    try {
      await updateNutritionLog(logId, {
        calories: toNum(calories),
        protein: toNum(protein),
        carbs: toNum(carbs),
        fats: toNum(fats),
        notes: notes.trim() ? notes.trim() : null,
      });
    } catch (e: any) {
      console.error("[nutrition save] error:", e);
      setError(e?.message ?? "Failed to save nutrition.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-300">Loading…</div>;
  }

  return (
    <div>
      {/* PAGE HEADER (inside content area) */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Nutrition</h1>
        <p className="mt-1 text-sm text-zinc-300">Log your macros • {dateIso}</p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm text-zinc-300">Date</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
            />
          </label>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 sm:col-span-2">
            <div className="text-sm font-semibold">Targets (Program)</div>
            <div className="mt-2 text-sm text-zinc-300">
              Calories:{" "}
              <span className="font-medium text-zinc-100">{calorieTarget}</span>
              {" • "}
              Protein:{" "}
              <span className="font-medium text-zinc-100">{proteinTarget}g</span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              (MVP: assumes training-day target — later we’ll auto-detect rest vs training.)
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="text-sm text-zinc-300">Calories</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 2600"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-300">Protein (g)</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 190"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-300">Carbs (g)</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 250"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-300">Fats (g)</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              value={fats}
              onChange={(e) => setFats(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 80"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-sm text-zinc-300">Notes (optional)</span>
          <textarea
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hunger, cravings, missed meal, travel day, etc."
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <Link
            to="/today"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900"
          >
            Back to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
