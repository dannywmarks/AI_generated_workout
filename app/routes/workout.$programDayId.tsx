// app/routes/workout.$programDayId.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram, updateProgram } from "~/services/programs.client";
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
    throw new Error(
      "[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_PROGRAM_EXERCISES",
    );
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

type SetErrors = {
  weight?: string;
  reps?: string;
  rir?: string;
};

type SetProgress = {
  completed: boolean;
  partial: boolean;
  errors: SetErrors;
};

function safeNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isInt(n: number) {
  return Number.isFinite(n) && Math.floor(n) === n;
}

/**
 * Strict logging rules:
 * - Weight must be a positive number
 * - Reps must be a positive integer
 * - RIR must be an integer between 0 and 6
 *
 * If you want RIR optional, set REQUIRE_RIR = false.
 */
const REQUIRE_RIR = true;

function validateSet(row: SetState): SetProgress {
  const errors: SetErrors = {};

  const hasAny = Boolean(
    (row.weight && row.weight.trim()) ||
      (row.reps && row.reps.trim()) ||
      (row.rir && row.rir.trim()) ||
      (row.notes && row.notes.trim()),
  );

  // treat an empty row as not partial and not complete
  if (!hasAny) {
    return { completed: false, partial: false, errors: {} };
  }

  const w = safeNum(row.weight);
  const r = safeNum(row.reps);
  const rir = safeNum(row.rir);

  // Weight
  if (w == null) errors.weight = "Enter a number";
  else if (w <= 0) errors.weight = "Must be > 0";

  // Reps
  if (r == null) errors.reps = "Enter a number";
  else if (r <= 0) errors.reps = "Must be > 0";
  else if (!isInt(r)) errors.reps = "Whole number";

  // RIR
  if (REQUIRE_RIR) {
    if (rir == null) errors.rir = "Required";
    else if (!isInt(rir)) errors.rir = "Whole number";
    else if (rir < 0 || rir > 6) errors.rir = "0–6";
  } else {
    if (row.rir.trim()) {
      if (rir == null) errors.rir = "Enter a number";
      else if (!isInt(rir)) errors.rir = "Whole number";
      else if (rir < 0 || rir > 6) errors.rir = "0–6";
    }
  }

  const completed = Object.keys(errors).length === 0;
  const partial = !!hasAny && !completed;

  return { completed, partial, errors };
}

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatMMSS(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Rest presets (seconds) based on your scheme.
 * We infer a category from reps + a couple name heuristics.
 */
type RestPreset = { seconds: number; label: string };

function restPresetForExercise(ex: ProgramExercise): RestPreset {
  const name = (ex.name || "").toLowerCase();
  const repMax = Number(ex.repMax || 0);

  const looksLikeCarry = /farmer|carry|suitcase|yoke/.test(name);
  const looksLikeCore = /ab|wheel|pallof|plank|dead bug|hollow/.test(name);

  // Carries: 90–150 sec
  if (looksLikeCarry) return { seconds: 120, label: "CARRY (90–150s)" };

  // Core / carries: 60–120 sec
  if (looksLikeCore) return { seconds: 90, label: "CORE (60–120s)" };

  // Main compound strength (4–6 reps): 3–5 minutes
  if (repMax > 0 && repMax <= 6) return { seconds: 240, label: "STRENGTH (3–5m)" };

  // Compound hypertrophy (6–12 reps): 2–3 minutes
  if (repMax > 0 && repMax <= 12) return { seconds: 150, label: "HYPERTROPHY (2–3m)" };

  // Accessories / isolations (10–20 reps): 60–90 seconds
  return { seconds: 75, label: "ACCESSORY (60–90s)" };
}

type RestTimerState = {
  running: boolean;
  startedAtMs: number | null;
  durationSec: number;
  exerciseId: string | null;
  exerciseName: string | null;
  setNumber: number | null; // 1-based
  presetLabel: string | null;
  auto: boolean; // whether last start was auto-triggered
};

function ProgressBar(props: { value: number; label?: string }) {
  const pct = Math.round(clamp01(props.value) * 100);
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-zinc-400">
        <span>{props.label ?? "Progress"}</span>
        <span className="text-emerald-200/90">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border border-emerald-900/40 bg-zinc-950/40">
        <div
          className="h-full rounded-full bg-emerald-400/70 shadow-[0_0_14px_rgba(52,211,153,0.35)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Pill(props: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/60 bg-emerald-950/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/90 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
      <span className="h-2 w-2 rounded-full bg-emerald-300/70 shadow-[0_0_14px_rgba(52,211,153,0.55)]" />
      {props.children}
    </div>
  );
}

function Panel(props: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-900/40 bg-zinc-950/40 shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_18px_60px_rgba(0,0,0,0.55)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative border-b border-emerald-900/30 bg-zinc-950/30 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

          {props.right ? (
            <div className="w-full sm:w-auto">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
                {props.right}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative px-4 py-5 sm:px-5">{props.children}</div>
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

// This feeds __app.tsx -> AppShell (prevents double headers)
export const handle = {
  title: "Workout",
  subtitle: "Damage Plan",
};

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
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetState[]>>(
    {},
  );

  // ===== Rest Timer =====
  const [restTimer, setRestTimer] = useState<RestTimerState>({
    running: false,
    startedAtMs: null,
    durationSec: 0,
    exerciseId: null,
    exerciseName: null,
    setNumber: null,
    presetLabel: null,
    auto: false,
  });
  const [restNowMs, setRestNowMs] = useState<number>(() => Date.now());
  const lastAutoStartRef = useRef<string | null>(null); // prevents re-trigger loops

  useEffect(() => {
    if (!restTimer.running) return;
    const t = window.setInterval(() => setRestNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [restTimer.running]);

  const restElapsedSec = useMemo(() => {
    if (!restTimer.running || !restTimer.startedAtMs) return 0;
    return Math.max(0, Math.floor((restNowMs - restTimer.startedAtMs) / 1000));
  }, [restNowMs, restTimer.running, restTimer.startedAtMs]);

  const restRemainingSec = useMemo(() => {
    if (!restTimer.running) return 0;
    const dur = Number(restTimer.durationSec || 0);
    return Math.max(0, dur - restElapsedSec);
  }, [restTimer.running, restTimer.durationSec, restElapsedSec]);

  const restProgress = useMemo(() => {
    const dur = Number(restTimer.durationSec || 0);
    if (!restTimer.running || dur <= 0) return 0;
    return clamp01(restElapsedSec / dur);
  }, [restTimer.running, restTimer.durationSec, restElapsedSec]);

  useEffect(() => {
    // auto-stop when reaches 0
    if (!restTimer.running) return;
    if (restTimer.durationSec > 0 && restRemainingSec <= 0) {
      setRestTimer((prev) => ({ ...prev, running: false }));
    }
  }, [restRemainingSec, restTimer.running, restTimer.durationSec]);

  function startRestTimer(opts: {
    ex: ProgramExercise;
    setNumber: number;
    seconds?: number;
    label?: string;
    auto?: boolean;
  }) {
    const preset = restPresetForExercise(opts.ex);

    // IMPORTANT: avoid mixing ?? and || without parentheses.
    // We'll do it in two steps for TS happiness.
    const givenSeconds = opts.seconds ?? null;
    const dur = givenSeconds != null ? givenSeconds : preset.seconds;

    const givenLabel = opts.label ?? null;
    const lbl = givenLabel != null ? givenLabel : preset.label;

    const key = `${opts.ex.$id}:${opts.setNumber}:${dur}:${lbl}:${opts.auto ? "A" : "M"}`;
    lastAutoStartRef.current = key;

    setRestNowMs(Date.now());
    setRestTimer({
      running: true,
      startedAtMs: Date.now(),
      durationSec: dur,
      exerciseId: opts.ex.$id,
      exerciseName: opts.ex.name,
      setNumber: opts.setNumber,
      presetLabel: lbl,
      auto: Boolean(opts.auto),
    });
  }

  function stopRestTimer() {
    setRestTimer((prev) => ({ ...prev, running: false }));
  }

  function adjustRestTimer(deltaSec: number) {
    setRestTimer((prev) => {
      const cur = Number(prev.durationSec || 0);
      const next = Math.max(10, cur + deltaSec);
      return { ...prev, durationSec: next };
    });
  }

  function restartRestTimer() {
    setRestTimer((prev) => {
      if (!prev.exerciseId || !prev.setNumber) return prev;
      return { ...prev, running: true, startedAtMs: Date.now() };
    });
    setRestNowMs(Date.now());
  }

  // validation snapshot (for UI)
  const validationByExercise = useMemo(() => {
    const out: Record<string, SetProgress[]> = {};
    for (const ex of exercises) {
      const rows = setsByExercise[ex.$id] ?? [];
      out[ex.$id] = rows.map((r) => validateSet(r));
    }
    return out;
  }, [exercises, setsByExercise]);

  const totalPlannedSets = useMemo(() => {
    return exercises.reduce((sum, ex) => sum + Number(ex.sets || 0), 0);
  }, [exercises]);

  const totalCompletedSets = useMemo(() => {
    let done = 0;
    for (const ex of exercises) {
      const rows = setsByExercise[ex.$id] ?? [];
      for (const row of rows) {
        if (validateSet(row).completed) done += 1;
      }
    }
    return done;
  }, [exercises, setsByExercise]);

  const dayProgress = useMemo(() => {
    if (!totalPlannedSets) return 0;
    return totalCompletedSets / totalPlannedSets;
  }, [totalCompletedSets, totalPlannedSets]);

  function exerciseProgress(exId: string, plannedSets: number) {
    const rows = setsByExercise[exId] ?? [];
    let completed = 0;
    let partial = 0;

    for (const r of rows) {
      const v = validateSet(r);
      if (v.completed) completed += 1;
      else if (v.partial) partial += 1;
    }

    const planned = Math.max(0, Number(plannedSets || 0));
    const pct = planned ? completed / planned : 0;

    return { planned, completed, partial, pct };
  }

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

        // 1) Load exercises for this program day
        const exRes = await databases.listDocuments(DB_ID, COL_PROGRAM_EXERCISES, [
          Query.equal("programDayId", programDayId),
          Query.orderAsc("orderIndex"),
          Query.limit(100),
        ]);

        const exs = exRes.documents as any as ProgramExercise[];
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

        const next: Record<string, SetState[]> = {};
        for (const ex of exs) {
          const rows: SetState[] = [];
          for (let i = 1; i <= Number(ex.sets || 0); i++) {
            const match = existingSets.find(
              (s: any) =>
                s.programExerciseId === ex.$id && Number(s.setNumber) === i,
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
      const prevRow = arr[idx] ?? { reps: "", weight: "", rir: "", notes: "" };
      const nextRow = { ...prevRow, ...patch };

      arr[idx] = nextRow;

      // Auto-start rest timer when a set transitions to completed
      // (compare validation before vs after)
      const before = validateSet(prevRow);
      const after = validateSet(nextRow);

      if (!before.completed && after.completed) {
        const ex = exercises.find((e) => e.$id === exId);
        if (ex) {
          const preset = restPresetForExercise(ex);
          const key = `${exId}:${idx + 1}:${preset.seconds}:${preset.label}:A`;

          // prevent repeated starts if React replays state updates
          if (lastAutoStartRef.current !== key) {
            startRestTimer({
              ex,
              setNumber: idx + 1,
              seconds: preset.seconds,
              label: preset.label,
              auto: true,
            });
          }
        }
      }

      return { ...prev, [exId]: arr };
    });
  }

  function hasAnyInvalidSet(): { hasInvalid: boolean; message?: string } {
    for (const ex of exercises) {
      const rows = setsByExercise[ex.$id] ?? [];
      for (let i = 0; i < rows.length; i++) {
        const v = validateSet(rows[i]);
        // invalid means: user started typing something but it isn't complete/valid
        if (v.partial) {
          return {
            hasInvalid: true,
            message: `Incomplete set(s) found in "${ex.name}". Finish the set fields or clear them before completing.`,
          };
        }
      }
    }
    return { hasInvalid: false };
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
          const v = validateSet(r);
          payload.push({
            programExerciseId: ex.$id,
            setNumber: i + 1,
            reps: v.completed ? safeNum(r.reps) : null,
            weight: v.completed ? safeNum(r.weight) : null,
            rir: v.completed
              ? safeNum(r.rir)
              : REQUIRE_RIR
                ? null
                : safeNum(r.rir),
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

    // Strict: don't allow complete if any partial/invalid sets exist
    const bad = hasAnyInvalidSet();
    if (bad.hasInvalid) {
      setError(bad.message ?? "Please fix incomplete sets before completing.");
      return;
    }

    // Strict: require ALL planned sets to be completed (not empty)
    if (totalPlannedSets && totalCompletedSets < totalPlannedSets) {
      setError(
        `Not finished yet: ${totalCompletedSets}/${totalPlannedSets} sets completed. Complete all sets before finishing.`,
      );
      return;
    }

    setFinishing(true);
    try {
      await onSave();
      await updateWorkoutLog(workoutLogId, { status: "complete" });

      // ✅ Advance to next workout (cycle orderIndex = currentDayIndex+1)
      // Your generated plan is 4 days/week, so cycle length is 4.
      const cycleLen = 4;
      const prevIdx = Number(program?.currentDayIndex ?? 0);
      const nextIdx = (prevIdx + 1) % cycleLen;

      if (program?.$id) {
        await updateProgram(program.$id, { currentDayIndex: nextIdx });
      }

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
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          Loading workout…
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.18) 1px, transparent 1px, transparent 4px)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 pb-36">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Pill>WORKOUT_CONSOLE // DAMAGE PLAN</Pill>
          <Link
            to="/today"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
          >
            BACK TO TODAY
          </Link>
        </div>

        <div className="mb-4">
          <div className="text-3xl font-extrabold tracking-tight text-emerald-200">
            WORKOUT LOG
          </div>
          <div className="mt-2 text-sm text-zinc-300">
            {program ? `Program: ${program.templateKey}` : ""}
            {totalPlannedSets ? ` • ${totalPlannedSets} planned sets` : ""}
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-900/30 bg-zinc-950/30 p-4">
            <ProgressBar value={dayProgress} label="DAY PROGRESS" />
            <div className="mt-2 text-xs text-zinc-400">
              Completed sets:{" "}
              <span className="text-zinc-200">
                {totalCompletedSets}/{totalPlannedSets}
              </span>
              {REQUIRE_RIR ? " • RIR required" : " • RIR optional"}
              {" • "}
              <span className="text-emerald-200/90">
                auto-rest starts when a set completes
              </span>
            </div>
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
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || finishing}
                className={[
                  "w-full rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200",
                  "shadow-[0_0_0_1px_rgba(16,185,129,0.14)] hover:bg-emerald-950/45 disabled:opacity-60",
                  "sm:w-auto",
                ].join(" ")}
              >
                {saving ? "SAVING…" : "SAVE CHECKPOINT"}
              </button>

              <button
                type="button"
                onClick={onFinish}
                disabled={saving || finishing}
                className={[
                  "w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200",
                  "hover:bg-zinc-900/40 disabled:opacity-60",
                  "sm:w-auto",
                ].join(" ")}
              >
                {finishing ? "FINISHING…" : "COMPLETE RUN"}
              </button>
            </>
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
            Tip: complete sets count only when Weight + Reps{" "}
            {REQUIRE_RIR ? "+ RIR" : ""} are valid.
          </div>
        </Panel>

        <div className="mt-6 space-y-4">
          {exercises.map((ex) => {
            const prog = exerciseProgress(ex.$id, ex.sets);
            const preset = restPresetForExercise(ex);

            return (
              <Panel
                key={ex.$id}
                title={ex.name}
                right={
                  <div className="w-full sm:w-[260px]">
                    <ProgressBar value={prog.pct} label="EXERCISE" />
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {prog.completed}/{prog.planned} complete
                      {prog.partial ? ` • ${prog.partial} partial` : ""}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      REST DEFAULT:{" "}
                      <span className="text-emerald-200/90">
                        {preset.label} ({Math.round(preset.seconds / 60)}m{" "}
                        {preset.seconds % 60}s)
                      </span>
                    </div>
                  </div>
                }
              >
                <div className="mb-4 text-xs text-zinc-400">
                  {ex.sets} sets • {ex.repMin}–{ex.repMax} reps • target RIR{" "}
                  {ex.rirTarget}
                  {ex.notes ? ` • ${ex.notes}` : ""}
                </div>

                <div className="overflow-x-auto rounded-xl border border-zinc-800/70 bg-zinc-950/30">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-zinc-950/40 text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Set</th>
                        <th className="px-4 py-3">Weight</th>
                        <th className="px-4 py-3">Reps</th>
                        <th className="px-4 py-3">RIR</th>
                        <th className="px-4 py-3">Notes</th>
                        <th className="px-4 py-3">Rest</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-200">
                      {(setsByExercise[ex.$id] ?? []).map((row, idx) => {
                        const v = validationByExercise[ex.$id]?.[idx] ?? {
                          completed: false,
                          partial: false,
                          errors: {},
                        };

                        const rowTone = v.completed
                          ? "border-emerald-900/40"
                          : v.partial
                            ? "border-red-900/50"
                            : "border-zinc-800/70";

                        const isCurrentTimer =
                          restTimer.exerciseId === ex.$id &&
                          restTimer.setNumber === idx + 1 &&
                          (restTimer.running || restRemainingSec === 0);

                        return (
                          <tr key={idx} className={`border-t ${rowTone}`}>
                            <td className="px-4 py-3 text-zinc-300">{idx + 1}</td>

                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <HudInput
                                  className={[
                                    "w-28",
                                    v.errors.weight
                                      ? "border-red-900/60 focus:border-red-700/60 focus:ring-red-600/20"
                                      : "",
                                  ].join(" ")}
                                  value={row.weight}
                                  onChange={(e) =>
                                    updateSet(ex.$id, idx, { weight: e.target.value })
                                  }
                                  inputMode="decimal"
                                  placeholder="lbs"
                                />
                                {v.errors.weight ? (
                                  <div className="text-xs text-red-200">
                                    {v.errors.weight}
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <HudInput
                                  className={[
                                    "w-24",
                                    v.errors.reps
                                      ? "border-red-900/60 focus:border-red-700/60 focus:ring-red-600/20"
                                      : "",
                                  ].join(" ")}
                                  value={row.reps}
                                  onChange={(e) =>
                                    updateSet(ex.$id, idx, { reps: e.target.value })
                                  }
                                  inputMode="numeric"
                                  placeholder="reps"
                                />
                                {v.errors.reps ? (
                                  <div className="text-xs text-red-200">
                                    {v.errors.reps}
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <HudInput
                                  className={[
                                    "w-24",
                                    v.errors.rir
                                      ? "border-red-900/60 focus:border-red-700/60 focus:ring-red-600/20"
                                      : "",
                                  ].join(" ")}
                                  value={row.rir}
                                  onChange={(e) =>
                                    updateSet(ex.$id, idx, { rir: e.target.value })
                                  }
                                  inputMode="numeric"
                                  placeholder="RIR"
                                />
                                {v.errors.rir ? (
                                  <div className="text-xs text-red-200">
                                    {v.errors.rir}
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <HudInput
                                value={row.notes}
                                onChange={(e) =>
                                  updateSet(ex.$id, idx, { notes: e.target.value })
                                }
                                placeholder="optional"
                              />

                              <div className="mt-2 text-xs text-zinc-500">
                                {v.completed ? (
                                  <span className="text-emerald-200/90">✓ complete</span>
                                ) : v.partial ? (
                                  <span className="text-red-200">incomplete</span>
                                ) : (
                                  <span>empty</span>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  startRestTimer({
                                    ex,
                                    setNumber: idx + 1,
                                    seconds: preset.seconds,
                                    label: preset.label,
                                    auto: false,
                                  })
                                }
                                className={[
                                  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]",
                                  isCurrentTimer
                                    ? "border-emerald-700/60 bg-emerald-950/35 text-emerald-200"
                                    : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900/40",
                                ].join(" ")}
                              >
                                {isCurrentTimer
                                  ? restTimer.running
                                    ? `RESTING ${formatMMSS(restRemainingSec)}`
                                    : "REST DONE"
                                  : "START REST"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {!setsByExercise[ex.$id]?.length ? (
                    <div className="px-4 py-4 text-sm text-zinc-400">
                      No sets configured for this exercise.
                    </div>
                  ) : null}
                </div>
              </Panel>
            );
          })}

          {!exercises.length ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 text-sm text-zinc-300">
              No exercises found for this program day.
            </div>
          ) : null}
        </div>
      </div>

      {/* ===== Sticky Rest HUD ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-4xl px-4 pb-4 sm:px-6">
          <div className="rounded-2xl border border-emerald-900/40 bg-zinc-950/80 backdrop-blur shadow-[0_0_0_1px_rgba(16,185,129,0.10),0_18px_60px_rgba(0,0,0,0.55)]">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  REST TIMER
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-zinc-100">
                  {restTimer.exerciseName
                    ? `${restTimer.exerciseName} • Set ${restTimer.setNumber ?? "—"}`
                    : "No active rest"}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {restTimer.presetLabel ? (
                    <span>
                      Preset:{" "}
                      <span className="text-emerald-200/90">
                        {restTimer.presetLabel}
                      </span>
                      {restTimer.auto ? " • auto" : " • manual"}
                    </span>
                  ) : (
                    <span>Complete a set to auto-start rest.</span>
                  )}
                </div>
              </div>

              <div className="w-full sm:w-[320px]">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-2xl font-extrabold tracking-tight text-emerald-200">
                    {restTimer.running
                      ? formatMMSS(restRemainingSec)
                      : restTimer.startedAtMs
                        ? "00:00"
                        : "--:--"}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                    {restTimer.durationSec ? `of ${formatMMSS(restTimer.durationSec)}` : ""}
                  </div>
                </div>
                <div className="mt-2">
                  <ProgressBar value={restProgress} label="REST" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => adjustRestTimer(+30)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
                    disabled={!restTimer.startedAtMs}
                  >
                    +30s
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustRestTimer(-30)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
                    disabled={!restTimer.startedAtMs}
                  >
                    -30s
                  </button>
                  <button
                    type="button"
                    onClick={stopRestTimer}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
                    disabled={!restTimer.running}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    onClick={restartRestTimer}
                    className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200 hover:bg-emerald-950/45 disabled:opacity-60"
                    disabled={!restTimer.exerciseId || !restTimer.setNumber}
                  >
                    Restart
                  </button>
                </div>

                <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  Tip: if reps would drop badly, add 30–60s.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
