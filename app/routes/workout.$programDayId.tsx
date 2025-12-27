// app/routes/workout.$programDayId.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";
import {
  getOrCreateWorkoutLog,
  listSetLogs,
  upsertSetLogs,
  updateWorkoutLog,
} from "~/services/workoutLogs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_PROGRAM_EXERCISES = import.meta.env.VITE_COL_PROGRAM_EXERCISES as string;

function assertEnv() {
  if (!DB_ID || !COL_PROGRAM_EXERCISES) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_PROGRAM_EXERCISES");
  }
}

type ProgramExercise = {
  $id: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: number;
  notes?: string | null;
  orderIndex: number;
};

type SetState = {
  reps: string; // keep as string for inputs
  weight: string;
  rir: string;
  notes: string;
};

function safeNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function WorkoutRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const programDayId = params.programDayId; // ✅ must match your route param

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [program, setProgram] = useState<any>(null);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [workoutNotes, setWorkoutNotes] = useState("");

  const [exercises, setExercises] = useState<ProgramExercise[]>([]);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetState[]>>({});

  const totalSets = useMemo(() => {
    return exercises.reduce((sum, ex) => sum + Number(ex.sets || 0), 0);
  }, [exercises]);

  useEffect(() => {
    assertEnv();

    (async () => {
      try {
        setError(null);

        if (!programDayId) {
          setError("Missing program day id.");
          setLoading(false);
          return;
        }

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

        // 1) Load program exercises for this day
        const exRes = await databases.listDocuments(DB_ID, COL_PROGRAM_EXERCISES, [
          Query.equal("programDayId", programDayId),
          Query.orderAsc("orderIndex"),
          Query.limit(100),
        ]);

        const exs = (exRes.documents as any) as ProgramExercise[];
        setExercises(exs);

        // 2) Create-or-load workout log (one per day/date)
        const log = await getOrCreateWorkoutLog({
          programId: active.$id,
          programDayId,
        });

        setWorkoutLogId(log.$id);
        setWorkoutNotes((log as any)?.notes ?? "");

        // 3) Prefill set state from existing set logs (if user revisits)
        const existingSets = await listSetLogs(log.$id);

        // build default state
        const next: Record<string, SetState[]> = {};
        for (const ex of exs) {
          const rows: SetState[] = [];
          for (let i = 1; i <= Number(ex.sets || 0); i++) {
            const match = existingSets.find(
              (s) => s.programExerciseId === ex.$id && Number(s.setNumber) === i,
            );
            rows.push({
              reps: match?.reps != null ? String(match.reps) : "",
              weight: match?.weight != null ? String(match.weight) : "",
              rir: match?.rir != null ? String(match.rir) : "",
              notes: match?.notes ?? "",
            });
          }
          next[ex.$id] = rows;
        }
        setSetsByExercise(next);

        setLoading(false);
      } catch (e: any) {
        console.error("[workout] error:", e);
        setError(e?.message ?? "Failed to load workout.");
        setLoading(false);
      }
    })();
  }, [navigate, programDayId]);

  function updateSet(exId: string, idx: number, patch: Partial<SetState>) {
    setSetsByExercise((prev) => {
      const arr = prev[exId] ? [...prev[exId]] : [];
      const row = arr[idx] ?? { reps: "", weight: "", rir: "", notes: "" };
      arr[idx] = { ...row, ...patch };
      return { ...prev, [exId]: arr };
    });
  }

  async function onSave() {
    if (!workoutLogId) {
      setError("Missing workout log id.");
      return;
    }
    setError(null);
    setSaving(true);

    try {
      // save notes first
      await updateWorkoutLog(workoutLogId, { notes: workoutNotes });

      // flatten set payload
      const payload: Array<{
        programExerciseId: string;
        setNumber: number;
        reps: number | null;
        weight: number | null;
        rir: number | null;
        notes: string | null;
      }> = [];

      for (const ex of exercises) {
        const rows = setsByExercise[ex.$id] ?? [];
        rows.forEach((r, i) => {
          payload.push({
            programExerciseId: ex.$id,
            setNumber: i + 1,
            reps: safeNum(r.reps),
            weight: safeNum(r.weight),
            rir: safeNum(r.rir),
            notes: r.notes?.trim() ? r.notes.trim() : null,
          });
        });
      }

      await upsertSetLogs({ workoutLogId, sets: payload });

      setSaving(false);
    } catch (e: any) {
      console.error("[workout save] error:", e);
      setError(e?.message ?? "Failed to save workout.");
      setSaving(false);
    }
  }

  async function onFinish() {
    if (!workoutLogId) {
      setError("Missing workout log id.");
      return;
    }
    setFinishing(true);
    try {
      await onSave();
      await updateWorkoutLog(workoutLogId, { status: "complete" });
      navigate("/today", { replace: true });
    } catch (e: any) {
      console.error("[workout finish] error:", e);
      setError(e?.message ?? "Failed to finish workout.");
    } finally {
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-4xl px-6 py-10">Loading workout…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Workout Log</h1>
            <p className="mt-1 text-sm text-zinc-300">
              {program ? `Program: ${program.templateKey}` : ""}
              {totalSets ? ` • ${totalSets} total sets` : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              to="/today"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
            >
              Back
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <label className="block">
            <span className="text-sm text-zinc-300">Workout notes</span>
            <textarea
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              rows={3}
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="How did it feel? Any pain? Any PRs?"
            />
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || finishing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              onClick={onFinish}
              disabled={saving || finishing}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
            >
              {finishing ? "Finishing…" : "Finish workout"}
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {exercises.map((ex) => (
            <div key={ex.$id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">{ex.name}</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {ex.sets} sets • {ex.repMin}–{ex.repMax} reps • target RIR {ex.rirTarget}
                    {ex.notes ? ` • ${ex.notes}` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-zinc-400">
                    <tr>
                      <th className="py-2 pr-2">Set</th>
                      <th className="py-2 pr-2">Weight</th>
                      <th className="py-2 pr-2">Reps</th>
                      <th className="py-2 pr-2">RIR</th>
                      <th className="py-2 pr-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(setsByExercise[ex.$id] ?? []).map((row, idx) => (
                      <tr key={idx} className="border-t border-zinc-800">
                        <td className="py-2 pr-2 text-zinc-300">{idx + 1}</td>

                        <td className="py-2 pr-2">
                          <input
                            className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 outline-none focus:border-emerald-600"
                            value={row.weight}
                            onChange={(e) => updateSet(ex.$id, idx, { weight: e.target.value })}
                            inputMode="decimal"
                            placeholder="lbs"
                          />
                        </td>

                        <td className="py-2 pr-2">
                          <input
                            className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 outline-none focus:border-emerald-600"
                            value={row.reps}
                            onChange={(e) => updateSet(ex.$id, idx, { reps: e.target.value })}
                            inputMode="numeric"
                            placeholder="reps"
                          />
                        </td>

                        <td className="py-2 pr-2">
                          <input
                            className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 outline-none focus:border-emerald-600"
                            value={row.rir}
                            onChange={(e) => updateSet(ex.$id, idx, { rir: e.target.value })}
                            inputMode="numeric"
                            placeholder="RIR"
                          />
                        </td>

                        <td className="py-2 pr-2">
                          <input
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 outline-none focus:border-emerald-600"
                            value={row.notes}
                            onChange={(e) => updateSet(ex.$id, idx, { notes: e.target.value })}
                            placeholder="optional"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!setsByExercise[ex.$id]?.length ? (
                  <p className="mt-3 text-sm text-zinc-400">No sets configured for this exercise.</p>
                ) : null}
              </div>
            </div>
          ))}

          {!exercises.length ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-300">
              No exercises found for this program day.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
