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
  reps: string;
  weight: string;
  rir: string;
  notes: string;
};

function safeNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Pill(props: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/60 bg-emerald-950/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/90 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
      <span className="h-2 w-2 rounded-full bg-emerald-300/70 shadow-[0_0_14px_rgba(52,211,153,0.55)]" />
      {props.children}
    </div>
  );
}

function Panel(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-900/40 bg-zinc-950/40 shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_18px_60px_rgba(0,0,0,0.55)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative border-b border-emerald-900/30 bg-zinc-950/30 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-300/70 shadow-[0_0_14px_rgba(52,211,153,0.55)]" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide text-zinc-100">
                {props.title}
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                STATUS: <span className="text-emerald-200/90">READY</span>
              </div>
            </div>
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
      </div>

      <div className="relative px-5 py-5">{props.children}</div>
    </section>
  );
}

function HudInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100 outline-none",
        "placeholder:text-zinc-600",
        "focus:border-emerald-700/70 focus:ring-2 focus:ring-emerald-600/20",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function HudTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100 outline-none",
        "placeholder:text-zinc-600",
        "focus:border-emerald-700/70 focus:ring-2 focus:ring-emerald-600/20",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export default function WorkoutRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const programDayId = params.programDayId;

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

        const exRes = await databases.listDocuments(DB_ID, COL_PROGRAM_EXERCISES, [
          Query.equal("programDayId", programDayId),
          Query.orderAsc("orderIndex"),
          Query.limit(100),
        ]);

        const exs = (exRes.documents as any) as ProgramExercise[];
        setExercises(exs);

        const log = await getOrCreateWorkoutLog({
          programId: active.$id,
          programDayId,
        });

        setWorkoutLogId(log.$id);
        setWorkoutNotes((log as any)?.notes ?? "");

        const existingSets = await listSetLogs(log.$id);

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
      await updateWorkoutLog(workoutLogId, { notes: workoutNotes });

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
    <main className="relative min-h-screen bg-zinc-950 text-zinc-100">
      {/* scanlines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.18) 1px, transparent 1px, transparent 4px)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Pill>WORKOUT_CONSOLE // DAMAGE PLAN</Pill>
          <Link
            to="/today"
            className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
          >
            BACK TO TODAY
          </Link>
        </div>

        <div className="mb-4">
          <div className="text-3xl font-extrabold tracking-tight text-emerald-200">WORKOUT LOG</div>
          <div className="mt-2 text-sm text-zinc-300">
            {program ? `Program: ${program.templateKey}` : ""}
            {totalSets ? ` • ${totalSets} total sets` : ""}
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <Panel
          title="WORKOUT_NOTES"
          right={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={saving || finishing}
                className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.14)] hover:bg-emerald-950/45 disabled:opacity-60"
              >
                {saving ? "SAVING…" : "SAVE CHECKPOINT"}
              </button>

              <button
                type="button"
                onClick={onFinish}
                disabled={saving || finishing}
                className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40 disabled:opacity-60"
              >
                {finishing ? "FINISHING…" : "COMPLETE RUN"}
              </button>
            </div>
          }
        >
          <label className="block">
            <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
              NOTES
            </div>
            <HudTextArea
              rows={3}
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="How did it feel? Any pain? Any PRs?"
              className="mt-2"
            />
          </label>

          <div className="mt-4 text-xs text-zinc-500">
            Tip: log honest RIR. The goal is repeatable progress, not ego numbers.
          </div>
        </Panel>

        <div className="mt-6 space-y-4">
          {exercises.map((ex) => (
            <Panel key={ex.$id} title={ex.name}>
              <div className="mb-4 text-xs text-zinc-400">
                {ex.sets} sets • {ex.repMin}–{ex.repMax} reps • target RIR {ex.rirTarget}
                {ex.notes ? ` • ${ex.notes}` : ""}
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-800/70 bg-zinc-950/30">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-zinc-950/40 text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Set</th>
                      <th className="px-4 py-3">Weight</th>
                      <th className="px-4 py-3">Reps</th>
                      <th className="px-4 py-3">RIR</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-200">
                    {(setsByExercise[ex.$id] ?? []).map((row, idx) => (
                      <tr key={idx} className="border-t border-zinc-800/70">
                        <td className="px-4 py-3 text-zinc-300">{idx + 1}</td>

                        <td className="px-4 py-3">
                          <HudInput
                            className="w-28"
                            value={row.weight}
                            onChange={(e) => updateSet(ex.$id, idx, { weight: e.target.value })}
                            inputMode="decimal"
                            placeholder="lbs"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <HudInput
                            className="w-24"
                            value={row.reps}
                            onChange={(e) => updateSet(ex.$id, idx, { reps: e.target.value })}
                            inputMode="numeric"
                            placeholder="reps"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <HudInput
                            className="w-24"
                            value={row.rir}
                            onChange={(e) => updateSet(ex.$id, idx, { rir: e.target.value })}
                            inputMode="numeric"
                            placeholder="RIR"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <HudInput
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
                  <div className="px-4 py-4 text-sm text-zinc-400">
                    No sets configured for this exercise.
                  </div>
                ) : null}
              </div>
            </Panel>
          ))}

          {!exercises.length ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 text-sm text-zinc-300">
              No exercises found for this program day.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
