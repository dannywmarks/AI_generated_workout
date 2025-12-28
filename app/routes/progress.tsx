// app/routes/progress.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ID, Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";
import { listNutritionLogs } from "~/services/nutritionLogs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_WORKOUT_LOGS = import.meta.env.VITE_COL_WORKOUT_LOGS as string;

// ✅ New collections (you said you added these in Appwrite)
const COL_WORKOUT_CHALLENGES = import.meta.env.VITE_COL_WORKOUT_CHALLENGES as string;
const COL_CHALLENGE_LOGS = import.meta.env.VITE_COL_CHALLENGE_LOGS as string;

function assertEnv() {
  if (!DB_ID || !COL_WORKOUT_LOGS) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_WORKOUT_LOGS");
  }
  if (!COL_WORKOUT_CHALLENGES || !COL_CHALLENGE_LOGS) {
    throw new Error(
      "[ENV] Missing VITE_COL_WORKOUT_CHALLENGES or VITE_COL_CHALLENGE_LOGS (Workout Challenges feature)",
    );
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

/** Monday-based week start for an ISO date string */
function weekStartIso(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0=Sun,1=Mon...
  const diffToMon = (day + 6) % 7; // Mon -> 0, Tue -> 1, Sun -> 6
  d.setDate(d.getDate() - diffToMon);
  return isoDate(d);
}

function weekEndIsoFromStart(weekStart: string) {
  return addDays(weekStart, 6);
}

function secondsToMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

type WorkoutLog = any;
type NutritionLog = any;

type ChallengeType = "count" | "time";

type WorkoutChallenge = {
  $id: string;
  key: string; // "100_burpees"
  title: string; // "100 BURPEES"
  description?: string | null;
  type: ChallengeType; // "count" | "time"
  targetCount?: number | null; // for count challenges
  targetSeconds?: number | null; // for time challenges
  xp: number;
  orderIndex?: number;
};

type ChallengeLog = any;

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

function ProgressBar(props: {
  value01: number;
  labelLeft?: string;
  labelRight?: string;
}) {
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
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXP));
  let need = 100;

  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = Math.floor(100 + (level - 1) * 20);
  }

  const progress01 = need > 0 ? clamp01(remaining / need) : 0;
  return { level, remaining, need, progress01 };
}

function fallbackChallenges(): Array<Omit<WorkoutChallenge, "$id">> {
  // If your "workout_challenges" collection is empty, you still get the feature.
  return [
    {
      key: "challenge_100_burpees",
      title: "100 BURPEES",
      description: "Finish 100 burpees this week. Log your total reps.",
      type: "count",
      targetCount: 100,
      targetSeconds: null,
      xp: 150,
      orderIndex: 1,
    },
    {
      key: "challenge_pushup_squat_combo",
      title: "100 PUSHUPS + 200 SQUATS",
      description: "Bodyweight combo. Log total pushups and squats as one score.",
      type: "count",
      targetCount: 300, // we store a single number: pushups + squats
      targetSeconds: null,
      xp: 180,
      orderIndex: 2,
    },
    {
      key: "challenge_dead_hang",
      title: "DEAD HANG (TO FAILURE)",
      description: "Go to failure. Log best time (seconds).",
      type: "time",
      targetCount: null,
      targetSeconds: 90, // baseline goal; adjust anytime
      xp: 120,
      orderIndex: 3,
    },
    {
      key: "challenge_50_pullups",
      title: "50 PULLUPS",
      description: "Accumulate 50 pullups this week. Log total reps.",
      type: "count",
      targetCount: 50,
      targetSeconds: null,
      xp: 160,
      orderIndex: 4,
    },
  ];
}

export default function ProgressRoute() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [program, setProgram] = useState<any>(null);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [nutrition, setNutrition] = useState<NutritionLog[]>([]);

  // Challenges
  const [challenges, setChallenges] = useState<WorkoutChallenge[]>([]);
  const [challengeLogs, setChallengeLogs] = useState<ChallengeLog[]>([]);
  const [challengeBusy, setChallengeBusy] = useState<string | null>(null);

  // Local UI input per challenge (week progress entry)
  const [challengeInput, setChallengeInput] = useState<Record<string, string>>({});

  const todayIso = useMemo(() => isoDate(new Date()), []);
  const start14Iso = useMemo(() => addDays(todayIso, -13), [todayIso]);

  const thisWeekStart = useMemo(() => weekStartIso(todayIso), [todayIso]);
  const thisWeekEnd = useMemo(() => weekEndIsoFromStart(thisWeekStart), [thisWeekStart]);

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

        // Nutrition: last 14 days (plus buffer)
        const n = await listNutritionLogs({
          programId: active.$id,
          startIso: start14Iso,
          limit: 40,
        });
        setNutrition(n as any);

        // Challenges (template list)
        const chRes = await databases.listDocuments(DB_ID, COL_WORKOUT_CHALLENGES, [
          Query.orderAsc("orderIndex"),
          Query.limit(50),
        ]);
        const chDocs = (chRes.documents ?? []) as any as WorkoutChallenge[];

        // Logs: pull a bit more so we can compute both “this week” and “last 14”
        const logRes = await databases.listDocuments(DB_ID, COL_CHALLENGE_LOGS, [
          Query.equal("userId", user.$id),
          Query.equal("programId", active.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(200),
        ]);
        const logs = (logRes.documents ?? []) as any as ChallengeLog[];

        // If no challenge templates exist, use local fallbacks (still works)
        if (chDocs.length) {
          setChallenges(chDocs);
        } else {
          // create local-only items with fake ids (key acts as id in UI)
          const fallback = fallbackChallenges().map((c) => ({
            ...c,
            $id: c.key,
          })) as any as WorkoutChallenge[];
          setChallenges(fallback);
        }

        setChallengeLogs(logs);

        // init inputs with this week values (if any)
        const inputs: Record<string, string> = {};
        for (const c of (chDocs.length ? chDocs : ((fallbackChallenges().map((x) => ({ ...x, $id: x.key })) as any) as WorkoutChallenge[]))) {
          const v = getThisWeekValueFor(c.$id, logs, thisWeekStart);
          inputs[c.$id] = v != null ? String(v) : "";
        }
        setChallengeInput(inputs);

        setLoading(false);
      } catch (e: any) {
        console.error("[progress] error:", e);
        setError(e?.message ?? "Failed to load progress.");
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const baseXP14 = useMemo(() => rows.reduce((sum, r) => sum + r.xp, 0), [rows]);

  // Challenge XP: count challenge completions whose week overlaps last 14 days
  const challengeXP14 = useMemo(() => {
    const start = start14Iso;
    const end = todayIso;

    let xp = 0;

    for (const log of challengeLogs) {
      const ws = String(log.weekStartIso ?? "").slice(0, 10);
      if (!ws) continue;
      // week overlaps window if weekStart <= end and weekEnd >= start
      const we = weekEndIsoFromStart(ws);
      const overlaps = ws <= end && we >= start;
      if (!overlaps) continue;

      const completed = Boolean(log.completed);
      if (!completed) continue;

      const challengeId = String(log.challengeId ?? "");
      const ch = challenges.find((c) => String(c.$id) === challengeId);
      xp += Number(ch?.xp ?? 0);
    }

    return xp;
  }, [challengeLogs, challenges, start14Iso, todayIso]);

  const totalXP14 = useMemo(() => baseXP14 + challengeXP14, [baseXP14, challengeXP14]);

  const levelInfo = useMemo(() => levelFromXP(totalXP14), [totalXP14]);

  const streaks = useMemo(() => {
    let current = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const calGate = calorieTarget ? r.calOk : r.hasNutrition;
      const good = r.hasNutrition && r.proteinOk && calGate;
      if (!good) break;
      current += 1;
    }

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

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    return {
      avgCalories: avg(cals),
      avgProtein: avg(prots),
    };
  }, [rows]);

  // ==== Challenges helpers ====

  function getThisWeekLogFor(challengeId: string, logs: ChallengeLog[], weekStart: string) {
    return logs.find(
      (l) =>
        String(l.challengeId) === String(challengeId) &&
        String(l.weekStartIso ?? "").slice(0, 10) === weekStart,
    );
  }

  function getThisWeekValueFor(challengeId: string, logs: ChallengeLog[], weekStart: string) {
    const log = getThisWeekLogFor(challengeId, logs, weekStart);
    if (!log) return null;
    if (log.valueSeconds != null) return Number(log.valueSeconds);
    if (log.valueCount != null) return Number(log.valueCount);
    return null;
  }

  function challengeProgress01(ch: WorkoutChallenge, weekValue: number | null) {
    if (weekValue == null) return 0;
    if (ch.type === "time") {
      const target = Number(ch.targetSeconds ?? 0);
      return target > 0 ? clamp01(weekValue / target) : 0;
    }
    const target = Number(ch.targetCount ?? 0);
    return target > 0 ? clamp01(weekValue / target) : 0;
  }

  function challengeDisplayTarget(ch: WorkoutChallenge) {
    if (ch.type === "time") {
      const t = Number(ch.targetSeconds ?? 0);
      return t ? `${secondsToMMSS(t)} target` : "target —";
    }
    const t = Number(ch.targetCount ?? 0);
    return t ? `${t} reps target` : "target —";
  }

  function formatWeekValue(ch: WorkoutChallenge, v: number | null) {
    if (v == null) return "—";
    if (ch.type === "time") return secondsToMMSS(v);
    return String(v);
  }

  async function upsertThisWeekChallenge(ch: WorkoutChallenge) {
    try {
      setError(null);
      setChallengeBusy(ch.$id);

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

      const raw = (challengeInput[ch.$id] ?? "").trim();
      const n = raw ? Number(raw) : null;
      if (n == null || !Number.isFinite(n) || n < 0) {
        setError(`Enter a valid ${ch.type === "time" ? "seconds" : "rep"} number for "${ch.title}".`);
        return;
      }

      const existing = getThisWeekLogFor(ch.$id, challengeLogs, thisWeekStart);

      const patch: any = {
        userId: user.$id,
        programId: active.$id,
        challengeId: ch.$id,
        weekStartIso: thisWeekStart,
        weekEndIso: thisWeekEnd,
      };

      if (ch.type === "time") {
        patch.valueSeconds = Math.floor(n);
        patch.valueCount = null;
      } else {
        patch.valueCount = Math.floor(n);
        patch.valueSeconds = null;
      }

      // complete when hitting target (or exceeding)
      const vNow = ch.type === "time" ? Number(patch.valueSeconds ?? 0) : Number(patch.valueCount ?? 0);
      const tgt = ch.type === "time" ? Number(ch.targetSeconds ?? 0) : Number(ch.targetCount ?? 0);
      const isComplete = tgt > 0 ? vNow >= tgt : false;

      patch.completed = isComplete;
      patch.completedAt = isComplete ? new Date().toISOString() : null;

      if (existing?.$id && !String(existing.$id).startsWith("challenge_")) {
        // normal Appwrite doc
        const updated = await databases.updateDocument(DB_ID, COL_CHALLENGE_LOGS, existing.$id, patch);
        setChallengeLogs((prev) => prev.map((x) => (x.$id === existing.$id ? updated : x)));
      } else if (existing?.$id && String(existing.$id).startsWith("challenge_")) {
        // fallback-mode log stored locally only (rare). We'll still create a real log now.
        const created = await databases.createDocument(DB_ID, COL_CHALLENGE_LOGS, ID.unique(), patch);
        setChallengeLogs((prev) => [created, ...prev.filter((x) => x.$id !== existing.$id)]);
      } else {
        const created = await databases.createDocument(DB_ID, COL_CHALLENGE_LOGS, ID.unique(), patch);
        setChallengeLogs((prev) => [created, ...prev]);
      }
    } catch (e: any) {
      console.error("[challenge upsert] error:", e);
      setError(e?.message ?? "Failed to update challenge.");
    } finally {
      setChallengeBusy(null);
    }
  }

  async function markChallengeComplete(ch: WorkoutChallenge) {
    try {
      setError(null);
      setChallengeBusy(ch.$id);

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

      const existing = getThisWeekLogFor(ch.$id, challengeLogs, thisWeekStart);

      // if no existing log, create one at target
      const targetValue = ch.type === "time" ? Number(ch.targetSeconds ?? 0) : Number(ch.targetCount ?? 0);
      const patch: any = {
        userId: user.$id,
        programId: active.$id,
        challengeId: ch.$id,
        weekStartIso: thisWeekStart,
        weekEndIso: thisWeekEnd,
        completed: true,
        completedAt: new Date().toISOString(),
        valueCount: ch.type === "count" ? targetValue : null,
        valueSeconds: ch.type === "time" ? targetValue : null,
      };

      if (existing?.$id && !String(existing.$id).startsWith("challenge_")) {
        const updated = await databases.updateDocument(DB_ID, COL_CHALLENGE_LOGS, existing.$id, patch);
        setChallengeLogs((prev) => prev.map((x) => (x.$id === existing.$id ? updated : x)));
      } else {
        const created = await databases.createDocument(DB_ID, COL_CHALLENGE_LOGS, ID.unique(), patch);
        setChallengeLogs((prev) => [created, ...prev]);
      }

      // keep the input in sync
      setChallengeInput((prev) => ({
        ...prev,
        [ch.$id]: String(targetValue),
      }));
    } catch (e: any) {
      console.error("[challenge complete] error:", e);
      setError(e?.message ?? "Failed to mark challenge complete.");
    } finally {
      setChallengeBusy(null);
    }
  }

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

    // Challenge badges
    const completedThisWeek = challenges.filter((c) => {
      const log = getThisWeekLogFor(c.$id, challengeLogs, thisWeekStart);
      return Boolean(log?.completed);
    }).length;

    const anyChallengeComplete = completedThisWeek >= 1;
    const allChallengesComplete = challenges.length ? completedThisWeek === challenges.length : false;

    return [
      { title: "FIRST BLOOD", desc: "Log any nutrition day", earned: firstNutrition },
      { title: "WARM-UP COMPLETE", desc: "Complete any workout", earned: firstWorkout },
      {
        title: "PROTEIN STREAK",
        desc: "3-day best streak hitting protein (+ calories if target set)",
        earned: proteinStreak3,
      },
      { title: "IRON WEEK", desc: "5 workouts completed in last 14 days", earned: workout5 },
      {
        title: "PERFECT DAY",
        desc: "Hit targets (rules-based). Earn multiple times.",
        earned: perfectDays >= 1,
        count: perfectDays,
      },
      { title: "XP FARMER", desc: "Earn 500+ XP in last 14 days (includes challenges)", earned: xp500 },

      // New: Challenge / Quest badges
      { title: "SIDE QUEST", desc: "Complete 1 weekly Workout Challenge", earned: anyChallengeComplete },
      { title: "BOSS FIGHT", desc: "Complete ALL weekly Workout Challenges", earned: allChallengesComplete },
    ] as Array<{ title: string; desc: string; earned: boolean; count?: number }>;
  }, [
    rows,
    workoutCompleteCount14,
    streaks.best,
    totalXP14,
    calorieTarget,
    carbTarget,
    fatTarget,
    challenges,
    challengeLogs,
    thisWeekStart,
  ]);

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
          <div className="mt-2 text-sm text-zinc-300">Last 14 days • XP & Badges • Weekly Challenges</div>
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

                <div className="mt-2 space-y-1 text-xs text-zinc-400">
                  <div>
                    XP (base): <span className="text-zinc-200">{baseXP14}</span>
                  </div>
                  <div>
                    XP (challenges): <span className="text-emerald-200">{challengeXP14}</span>
                  </div>
                  <div>
                    XP (total): <span className="text-zinc-100 font-semibold">{totalXP14}</span>
                  </div>
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
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Completed</div>
                <div className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-100">
                  {workoutCompleteCount14}
                </div>
                <div className="mt-2 text-xs text-zinc-500">status=complete</div>
              </div>

              <div className="w-44 sm:w-40">
                <ProgressBar
                  value01={clamp01(workoutCompleteCount14 / 6)}
                  labelLeft="2-WK GOAL"
                  labelRight={`${workoutCompleteCount14}/6`}
                />
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-400">XP: +50 per completed workout.</div>
          </Panel>

          <Panel title="NUTRITION">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Logged days</div>
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
                <div className="mt-1 text-xs text-zinc-500">Target: {calorieTarget ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Avg protein</div>
                <div className="mt-1 text-xl font-semibold">{avgs.avgProtein ?? "—"}g</div>
                <div className="mt-1 text-xs text-zinc-500">Target: {proteinTarget ?? "—"}g</div>
              </div>
            </div>
          </Panel>
        </div>

        {/* ✅ WEEKLY CHALLENGES */}
        <div className="mt-6">
          <Panel
            title="WEEKLY_WORKOUT_CHALLENGES"
            right={
              <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                {thisWeekStart} → {thisWeekEnd}
              </span>
            }
          >
            <div className="text-xs text-zinc-400">
              Weekly “side quests” for extra XP. Enter your current total for the week (or seconds for dead hang).
              Hitting the target auto-completes it.
            </div>

            <div className="mt-4 space-y-3">
              {challenges.map((ch) => {
                const log = getThisWeekLogFor(ch.$id, challengeLogs, thisWeekStart);
                const weekValue = getThisWeekValueFor(ch.$id, challengeLogs, thisWeekStart);

                const prog01 = challengeProgress01(ch, weekValue);
                const completed = Boolean(log?.completed);

                const inputLabel =
                  ch.type === "time" ? "SECONDS (best)" : "TOTAL REPS (week)";

                const busy = challengeBusy === ch.$id;

                return (
                  <div
                    key={ch.$id}
                    className={[
                      "rounded-2xl border bg-zinc-950/35 p-4",
                      completed ? "border-emerald-900/60" : "border-zinc-800/70",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold tracking-wide text-zinc-100">
                            {ch.title}
                          </div>
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em]",
                              completed
                                ? "border-emerald-900/50 bg-emerald-950/25 text-emerald-200"
                                : "border-zinc-800/70 bg-zinc-950/30 text-zinc-400",
                            ].join(" ")}
                          >
                            {completed ? "COMPLETE" : "IN PROGRESS"}
                          </span>
                          <span className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/90">
                            +{Number(ch.xp ?? 0)} XP
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-zinc-400">
                          {ch.description ?? ""}
                        </div>

                        <div className="mt-3">
                          <ProgressBar
                            value01={prog01}
                            labelLeft={challengeDisplayTarget(ch)}
                            labelRight={`${formatWeekValue(ch, weekValue)} / ${ch.type === "time"
                              ? secondsToMMSS(Number(ch.targetSeconds ?? 0))
                              : String(Number(ch.targetCount ?? 0))}`}
                          />
                        </div>
                      </div>

                      <div className="w-full sm:w-[280px]">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                          {inputLabel}
                        </div>

                        <div className="mt-2 flex gap-2">
                          <HudInput
                            value={challengeInput[ch.$id] ?? ""}
                            onChange={(e) =>
                              setChallengeInput((prev) => ({
                                ...prev,
                                [ch.$id]: e.target.value,
                              }))
                            }
                            inputMode="numeric"
                            placeholder={ch.type === "time" ? "e.g. 75" : "e.g. 40"}
                            className="flex-1"
                          />

                          <button
                            type="button"
                            onClick={() => upsertThisWeekChallenge(ch)}
                            disabled={busy}
                            className={[
                              "shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]",
                              "border-emerald-900/50 bg-emerald-950/30 text-emerald-200",
                              "hover:bg-emerald-950/45 disabled:opacity-60",
                            ].join(" ")}
                          >
                            {busy ? "SAVING…" : "SAVE"}
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-xs text-zinc-500">
                            {completed
                              ? "Awarded when target hit."
                              : "Hit target to auto-complete."}
                          </div>

                          <button
                            type="button"
                            onClick={() => markChallengeComplete(ch)}
                            disabled={busy || completed}
                            className={[
                              "rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]",
                              completed
                                ? "border-zinc-800/70 bg-zinc-950/30 text-zinc-600"
                                : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900/40",
                              "disabled:opacity-60",
                            ].join(" ")}
                          >
                            FORCE COMPLETE
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!challenges.length ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 text-sm text-zinc-300">
                  No challenges found. Add templates in Appwrite or keep using the defaults.
                </div>
              ) : null}
            </div>

            <div className="mt-4 text-xs text-zinc-500">
              Tip: If you want “daily challenge” style instead of weekly totals, we can store `dateIso`
              on challenge logs and award XP per day attempt.
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
              MVP badges are calculated from your logs (workout_logs + nutrition_logs + challenge_logs). No manual toggles.
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
              Next ideas: per-exercise PR badges, weekly “boss fights”, streak multipliers, and a “Daily Quest”
              checklist (log workout, log nutrition, hit protein, finish steps, etc.).
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
