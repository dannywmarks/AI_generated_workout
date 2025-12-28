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

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtPct(p: number) {
  return `${Math.round(clamp01(p) * 100)}%`;
}

type WorkoutLog = any;
type NutritionLog = any;

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

      <div className="relative border-b border-emerald-900/30 bg-zinc-950/30 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-300/70 shadow-[0_0_14px_rgba(52,211,153,0.55)]" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide text-zinc-100">
                {props.title}
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                STATUS: <span className="text-emerald-200/90">TRACKING</span>
              </div>
            </div>
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
      </div>

      <div className="relative px-4 py-5 sm:px-5">{props.children}</div>
    </section>
  );
}

function ProgressBar(props: { value01: number; labelLeft?: string; labelRight?: string }) {
  const v = clamp01(props.value01);
  return (
    <div className="w-full">
      {(props.labelLeft || props.labelRight) && (
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-zinc-400">
          <span className="truncate">{props.labelLeft ?? ""}</span>
          <span className="shrink-0 text-zinc-500">{props.labelRight ?? fmtPct(v)}</span>
        </div>
      )}
      <div className="h-3 w-full rounded-full border border-zinc-800/80 bg-zinc-950/50 p-[2px]">
        <div
          className="h-full rounded-full bg-emerald-400/80 shadow-[0_0_18px_rgba(52,211,153,0.35)]"
          style={{ width: `${Math.round(v * 100)}%` }}
        />
      </div>
    </div>
  );
}

function BadgeCard(props: { title: string; desc: string; earned: boolean }) {
  return (
    <div
      className={[
        "rounded-2xl border bg-zinc-950/40 p-4",
        props.earned
          ? "border-emerald-900/50 shadow-[0_0_0_1px_rgba(16,185,129,0.10)]"
          : "border-zinc-800/70 opacity-60",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "mt-0.5 h-3 w-3 rounded-full",
            props.earned
              ? "bg-emerald-300/80 shadow-[0_0_14px_rgba(52,211,153,0.55)]"
              : "bg-zinc-600/60",
          ].join(" ")}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-wide text-zinc-100">
            {props.title}
          </div>
          <div className="mt-1 text-xs text-zinc-400">{props.desc}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * XP rules (simple + transparent):
 * - Workout complete: +50 XP
 * - Nutrition log present: +10 XP
 * - Calories within ±5% of target: +10 XP
 * - Protein >= target: +10 XP
 * - Carbs within ±10% of target (if target exists): +5 XP
 * - Fats within ±10% of target (if target exists): +5 XP
 */
function calcDayXP(args: {
  hasWorkoutComplete: boolean;
  hasNutrition: boolean;
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbTarget: number | null;
  fatTarget: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}) {
  let xp = 0;
  if (args.hasWorkoutComplete) xp += 50;
  if (args.hasNutrition) xp += 10;

  const calOk =
    args.calorieTarget && args.calories != null
      ? Math.abs(args.calories - args.calorieTarget) / args.calorieTarget <= 0.05
      : false;
  if (calOk) xp += 10;

  const proteinOk =
    args.proteinTarget && args.protein != null ? args.protein >= args.proteinTarget : false;
  if (proteinOk) xp += 10;

  const carbsOk =
    args.carbTarget && args.carbs != null
      ? Math.abs(args.carbs - args.carbTarget) / args.carbTarget <= 0.1
      : false;
  if (carbsOk) xp += 5;

  const fatsOk =
    args.fatTarget && args.fats != null
      ? Math.abs(args.fats - args.fatTarget) / args.fatTarget <= 0.1
      : false;
  if (fatsOk) xp += 5;

  return { xp, calOk, proteinOk, carbsOk, fatsOk };
}

function levelFromXP(totalXP: number) {
  // Smooth-ish curve: each level requires a bit more XP than the last.
  // L1: 0-99, L2: 100-219, L3: 220-359, etc.
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXP));
  let need = 100;

  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = Math.floor(100 + (level - 1) * 20); // +20 per level
  }

  const progress01 = need > 0 ? clamp01(remaining / need) : 0;
  return { level, remaining, need, progress01 };
}

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

        // Workouts: last ~80 (filter locally)
        const w = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
          Query.equal("userId", user.$id),
          Query.equal("programId", active.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(80),
        ]);
        setWorkouts((w.documents ?? []) as any);

        // Nutrition: last 14 days (plus a little buffer)
        const n = await listNutritionLogs({
          programId: active.$id,
          startIso: start14Iso,
          limit: 40,
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

  // Targets (pull from program; fallbacks are null-safe)
  const calorieTarget = useMemo(() => {
    const v = num(program?.trainingDayCalories ?? program?.calorieTarget);
    return v && v > 0 ? v : null;
  }, [program]);

  const proteinTarget = useMemo(() => {
    const v = num(program?.proteinTarget);
    return v && v > 0 ? v : null;
  }, [program]);

  const carbTarget = useMemo(() => {
    const v = num(program?.carbTarget ?? program?.carbsTarget);
    return v && v > 0 ? v : null;
  }, [program]);

  const fatTarget = useMemo(() => {
    const v = num(program?.fatTarget ?? program?.fatsTarget);
    return v && v > 0 ? v : null;
  }, [program]);

  const workoutCompleteCount14 = useMemo(() => {
    const start = start14Iso;
    return workouts.filter((w) => {
      const statusOk = String(w.status) === "complete";
      const d = String(w.dateIso ?? "").slice(0, 10);
      return statusOk && d >= start && d <= todayIso;
    }).length;
  }, [workouts, start14Iso, todayIso]);

  const nutritionLoggedCount14 = useMemo(() => {
    const byDate = new Set<string>();
    for (const n of nutrition) {
      if (n?.dateIso) byDate.add(String(n.dateIso));
    }
    let count = 0;
    for (let i = 13; i >= 0; i--) {
      const d = addDays(todayIso, -i);
      if (byDate.has(d)) count++;
    }
    return count;
  }, [nutrition, todayIso]);

  // Build 14-day rows
  const rows = useMemo(() => {
    const nByDate = new Map<string, NutritionLog>();
    for (const n of nutrition) {
      if (n?.dateIso) nByDate.set(String(n.dateIso), n);
    }

    // workout completions by date
    const wCompleteByDate = new Set<string>();
    for (const w of workouts) {
      if (String(w.status) === "complete" && w?.dateIso) {
        wCompleteByDate.add(String(w.dateIso).slice(0, 10));
      }
    }

    const out: Array<{
      dateIso: string;
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fats: number | null;
      workoutComplete: boolean;
      hasNutrition: boolean;
      xp: number;
      calOk: boolean;
      proteinOk: boolean;
      carbsOk: boolean;
      fatsOk: boolean;
    }> = [];

    for (let i = 13; i >= 0; i--) {
      const d = addDays(todayIso, -i);
      const n = nByDate.get(d);

      const calories = num(n?.calories);
      const protein = num(n?.protein);
      const carbs = num(n?.carbs);
      const fats = num(n?.fats);

      const hasNutrition = Boolean(n);
      const workoutComplete = wCompleteByDate.has(d);

      const { xp, calOk, proteinOk, carbsOk, fatsOk } = calcDayXP({
        hasWorkoutComplete: workoutComplete,
        hasNutrition,
        calorieTarget,
        proteinTarget,
        carbTarget,
        fatTarget,
        calories,
        protein,
        carbs,
        fats,
      });

      out.push({
        dateIso: d,
        calories,
        protein,
        carbs,
        fats,
        workoutComplete,
        hasNutrition,
        xp,
        calOk,
        proteinOk,
        carbsOk,
        fatsOk,
      });
    }

    return out;
  }, [nutrition, workouts, todayIso, calorieTarget, proteinTarget, carbTarget, fatTarget]);

  const totalXP14 = useMemo(() => rows.reduce((sum, r) => sum + r.xp, 0), [rows]);

  const levelInfo = useMemo(() => levelFromXP(totalXP14), [totalXP14]);

  const streaks = useMemo(() => {
    // current streak of "good day": nutrition logged + protein ok (and calories ok if target exists)
    let current = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const calGate = calorieTarget ? r.calOk : r.hasNutrition; // if no calorie target, don't block streak
      const good = r.hasNutrition && r.proteinOk && calGate;
      if (!good) break;
      current += 1;
    }

    // best streak same definition
    let best = 0;
    let run = 0;
    for (const r of rows) {
      const calGate = calorieTarget ? r.calOk : r.hasNutrition;
      const good = r.hasNutrition && r.proteinOk && calGate;
      if (good) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }

    return { current, best };
  }, [rows, calorieTarget]);

  const avgs = useMemo(() => {
    const cals = rows.map((r) => r.calories).filter((v): v is number => v != null);
    const prots = rows.map((r) => r.protein).filter((v): v is number => v != null);

    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

    return {
      avgCalories: avg(cals),
      avgProtein: avg(prots),
    };
  }, [rows]);

  const badges = useMemo(() => {
    const firstNutrition = rows.some((r) => r.hasNutrition);
    const firstWorkout = rows.some((r) => r.workoutComplete);

    const perfectDays = rows.filter((r) => {
      const calGate = calorieTarget ? r.calOk : r.hasNutrition;
      const carbGate = carbTarget ? r.carbsOk : true;
      const fatGate = fatTarget ? r.fatsOk : true;
      return r.hasNutrition && calGate && r.proteinOk && carbGate && fatGate;
    }).length;

    const workout5 = workoutCompleteCount14 >= 5;
    const proteinStreak3 = streaks.best >= 3;
    const xp500 = totalXP14 >= 500;

    return [
      {
        title: "FIRST BLOOD",
        desc: "Log any nutrition day",
        earned: firstNutrition,
      },
      {
        title: "WARM-UP COMPLETE",
        desc: "Complete any workout",
        earned: firstWorkout,
      },
      {
        title: "PROTEIN STREAK",
        desc: "3-day best streak hitting protein (+ calories if target set)",
        earned: proteinStreak3,
      },
      {
        title: "IRON WEEK",
        desc: "5 workouts completed in last 14 days",
        earned: workout5,
      },
      {
        title: "PERFECT DAY",
        desc: "Hit targets (rules-based). Earn multiple times.",
        earned: perfectDays >= 1,
        count: perfectDays,
      },
      {
        title: "XP FARMER",
        desc: "Earn 500+ XP in last 14 days",
        earned: xp500,
      },
    ] as Array<{ title: string; desc: string; earned: boolean; count?: number }>;
  }, [rows, workoutCompleteCount14, streaks.best, totalXP14, calorieTarget, carbTarget, fatTarget]);

  if (loading) {
    return <div className="text-sm text-zinc-300">Loading…</div>;
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

      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Pill>PROGRESS_CONSOLE // DAMAGE PLAN</Pill>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/nutrition"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
            >
              LOG NUTRITION
            </Link>
            <Link
              to="/today"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
            >
              BACK
            </Link>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-3xl font-extrabold tracking-tight text-emerald-200">PROGRESS</div>
          <div className="mt-2 text-sm text-zinc-300">
            Last 14 days • XP & Badges (MVP gamification)
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {/* HUD CARDS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Panel
            title="XP / LEVEL"
            right={<span className="text-xs uppercase tracking-[0.22em] text-zinc-500">14D</span>}
          >
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Level</div>
                <div className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-100">
                  {levelInfo.level}
                </div>
                <div className="mt-2 text-xs text-zinc-400">
                  XP: <span className="text-zinc-200">{totalXP14}</span>
                </div>
              </div>
              <div className="w-44 sm:w-40">
                <ProgressBar
                  value01={levelInfo.progress01}
                  labelLeft="NEXT LEVEL"
                  labelRight={`${levelInfo.remaining}/${levelInfo.need}`}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  Current streak
                </div>
                <div className="mt-1 text-2xl font-semibold">{streaks.current}d</div>
                <div className="mt-1 text-xs text-zinc-500">protein + calories (if set)</div>
              </div>
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Best streak</div>
                <div className="mt-1 text-2xl font-semibold">{streaks.best}d</div>
                <div className="mt-1 text-xs text-zinc-500">last 14 days</div>
              </div>
            </div>
          </Panel>

          <Panel title="WORKOUTS">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  Completed
                </div>
                <div className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-100">
                  {workoutCompleteCount14}
                </div>
                <div className="mt-2 text-xs text-zinc-500">status=complete</div>
              </div>

              <div className="w-44 sm:w-40">
                <ProgressBar
                  value01={clamp01(workoutCompleteCount14 / 6)} // 6 = “nice” target in 14 days
                  labelLeft="2-WK GOAL"
                  labelRight={`${workoutCompleteCount14}/6`}
                />
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-400">
              XP: +50 per completed workout.
            </div>
          </Panel>

          <Panel title="NUTRITION">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  Logged days
                </div>
                <div className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-100">
                  {nutritionLoggedCount14}
                </div>
                <div className="mt-2 text-xs text-zinc-500">last 14 days</div>
              </div>

              <div className="w-44 sm:w-40">
                <ProgressBar
                  value01={clamp01(nutritionLoggedCount14 / 14)}
                  labelLeft="CONSISTENCY"
                  labelRight={`${nutritionLoggedCount14}/14`}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Avg cals</div>
                <div className="mt-1 text-xl font-semibold">{avgs.avgCalories ?? "—"}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Target: {calorieTarget ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Avg protein</div>
                <div className="mt-1 text-xl font-semibold">{avgs.avgProtein ?? "—"}g</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Target: {proteinTarget ?? "—"}g
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* BADGE SHELF */}
        <div className="mt-6">
          <Panel
            title="BADGE_SHELF"
            right={
              <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Earned: {badges.filter((b) => b.earned).length}/{badges.length}
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {badges.map((b) => (
                <BadgeCard
                  key={b.title}
                  title={b.count && b.count > 1 ? `${b.title} x${b.count}` : b.title}
                  desc={b.desc}
                  earned={b.earned}
                />
              ))}
            </div>

            <div className="mt-4 text-xs text-zinc-500">
              MVP badges are calculated from your logs (workout_logs + nutrition_logs). No manual toggles.
            </div>
          </Panel>
        </div>

        {/* 14-DAY TABLE */}
        <div className="mt-6">
          <Panel
            title="14-DAY_LOGS"
            right={
              <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                XP total: {totalXP14}
              </span>
            }
          >
            <div className="overflow-x-auto rounded-xl border border-zinc-800/70 bg-zinc-950/30">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-zinc-950/40 text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Workout</th>
                    <th className="px-4 py-3">Calories</th>
                    <th className="px-4 py-3">Protein</th>
                    <th className="px-4 py-3">Carbs</th>
                    <th className="px-4 py-3">Fats</th>
                    <th className="px-4 py-3">XP</th>
                    <th className="px-4 py-3">Adherence</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-200">
                  {rows.map((r) => {
                    const calProg =
                      calorieTarget && r.calories != null ? clamp01(r.calories / calorieTarget) : 0;
                    const proteinProg =
                      proteinTarget && r.protein != null ? clamp01(r.protein / proteinTarget) : 0;

                    // simple “adherence” score 0..1 for display
                    const calGate = calorieTarget ? (r.calOk ? 1 : 0) : r.hasNutrition ? 1 : 0;
                    const pGate = r.proteinOk ? 1 : 0;
                    const cGate = carbTarget ? (r.carbsOk ? 1 : 0) : 1;
                    const fGate = fatTarget ? (r.fatsOk ? 1 : 0) : 1;
                    const score01 = (calGate + pGate + cGate + fGate) / 4;

                    return (
                      <tr key={r.dateIso} className="border-t border-zinc-800/70">
                        <td className="px-4 py-3 text-zinc-300">{r.dateIso}</td>

                        <td className="px-4 py-3">
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em]",
                              r.workoutComplete
                                ? "border-emerald-900/50 bg-emerald-950/25 text-emerald-200"
                                : "border-zinc-800/70 bg-zinc-950/30 text-zinc-400",
                            ].join(" ")}
                          >
                            {r.workoutComplete ? "COMPLETE" : "—"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-28">
                              <ProgressBar
                                value01={calProg}
                                labelLeft=""
                                labelRight={r.calories != null ? String(r.calories) : "—"}
                              />
                            </div>
                            <span className="text-xs text-zinc-500">
                              {calorieTarget ? `/${calorieTarget}` : ""}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-28">
                              <ProgressBar
                                value01={proteinProg}
                                labelLeft=""
                                labelRight={r.protein != null ? `${r.protein}g` : "—"}
                              />
                            </div>
                            <span className="text-xs text-zinc-500">
                              {proteinTarget ? `/${proteinTarget}g` : ""}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">{r.carbs ?? "—"}</td>
                        <td className="px-4 py-3">{r.fats ?? "—"}</td>

                        <td className="px-4 py-3 font-semibold text-emerald-200">{r.xp}</td>

                        <td className="px-4 py-3">
                          <div className="w-40">
                            <ProgressBar value01={score01} labelLeft="" labelRight={fmtPct(score01)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-zinc-500">
              Next ideas: per-exercise PR badges, weekly “boss fights”, streak-based multipliers, and a
              “Daily Quest” checklist (log workout, log nutrition, hit protein, finish steps, etc.).
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
