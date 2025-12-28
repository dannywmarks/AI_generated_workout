// app/routes/profile.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router";
import { Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";
import { listNutritionLogs } from "~/services/nutritionLogs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_WORKOUT_LOGS = import.meta.env.VITE_COL_WORKOUT_LOGS as string;

type User = any;

function assertEnv() {
  if (!DB_ID || !COL_WORKOUT_LOGS) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_WORKOUT_LOGS");
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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

function pct(value: number | null | undefined, target: number | null | undefined) {
  if (!target || target <= 0) return 0;
  if (value == null || !Number.isFinite(value)) return 0;
  return clamp((value / target) * 100, 0, 125);
}

function computeMacroTargets(program: any) {
  const cal = Number(program?.trainingDayCalories ?? 0) || 0;
  const protein = Number(program?.proteinTarget ?? 0) || 0;
  const explicitCarbs = Number(program?.carbsTarget ?? 0) || 0;
  const explicitFats = Number(program?.fatsTarget ?? 0) || 0;

  if (explicitCarbs > 0 && explicitFats > 0) {
    return { calories: cal, protein, carbs: explicitCarbs, fats: explicitFats };
  }

  if (cal <= 0 || protein <= 0) {
    return { calories: cal, protein, carbs: 0, fats: 0 };
  }

  const fats = Math.max(35, Math.round((cal * 0.25) / 9));
  const remaining = cal - protein * 4 - fats * 9;
  const carbs = Math.max(0, Math.round(remaining / 4));
  return { calories: cal, protein, carbs, fats };
}

function levelFromXP(xp: number) {
  const lvl = Math.floor(Math.max(0, xp) / 1000) + 1;
  const into = Math.max(0, xp) % 1000;
  return { level: lvl, into, next: 1000 };
}

function StatBar(props: { label: string; value: number; max?: number; hint?: string }) {
  const max = props.max ?? 100;
  const p = clamp((props.value / max) * 100, 0, 100);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.06)]">
      <div className="flex items-end justify-between gap-3">
        <div className="text-xs tracking-[0.16em] text-zinc-400">{props.label}</div>
        <div className="text-xs text-zinc-400">{Math.round(p)}%</div>
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-100">{props.value}</div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-900/70">
        <div
          className="h-full rounded-full bg-emerald-400/60 shadow-[0_0_18px_rgba(52,211,153,0.35)]"
          style={{ width: `${p}%` }}
        />
      </div>
      {props.hint ? <div className="mt-2 text-xs text-zinc-500">{props.hint}</div> : null}
    </div>
  );
}

export default function ProfileRoute() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [program, setProgram] = useState<any>(null);

  const [workouts14, setWorkouts14] = useState<any[]>([]);
  const [nutrition14, setNutrition14] = useState<any[]>([]);

  const [error, setError] = useState<string | null>(null);

  const todayIso = useMemo(() => isoDate(new Date()), []);
  const start14Iso = useMemo(() => addDays(todayIso, -13), [todayIso]);

  useEffect(() => {
    (async () => {
      try {
        assertEnv();
        setError(null);
        setLoading(true);

        const u = await getCurrentUser();
        if (!u) {
          navigate("/login", { replace: true });
          return;
        }
        setUser(u);

        const active = await getActiveProgram();
        if (!active) {
          navigate("/onboarding", { replace: true });
          return;
        }
        setProgram(active);

        const w = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
          Query.equal("userId", u.$id),
          Query.equal("programId", active.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(60),
        ]);

        // Filter locally to “last 14 days” is MVP-safe (since we’re not guaranteed date fields)
        setWorkouts14((w.documents ?? []) as any);

        const n = await listNutritionLogs({
          programId: active.$id,
          startIso: start14Iso,
          limit: 40,
        });
        setNutrition14(n as any);

        setLoading(false);
      } catch (e: any) {
        console.error("[profile] error:", e);
        setError(e?.message ?? "Failed to load profile.");
        setLoading(false);
      }
    })();
  }, [navigate, start14Iso]);

  const joined = useMemo(() => {
    if (!user?.$createdAt) return "—";
    try {
      return new Date(user.$createdAt).toLocaleString();
    } catch {
      return "—";
    }
  }, [user?.$createdAt]);

  const targets = useMemo(() => computeMacroTargets(program), [program]);

  const workoutCompleteCount = useMemo(
    () => workouts14.filter((w) => String(w.status) === "complete").length,
    [workouts14],
  );

  // Nutrition adherence / XP (same model as other tabs)
  const nutritionXP14 = useMemo(() => {
    if (!nutrition14?.length) return 0;
    let sum = 0;
    for (const n of nutrition14) {
      const cal = n?.calories != null ? Number(n.calories) : null;
      const p = n?.protein != null ? Number(n.protein) : null;
      const c = n?.carbs != null ? Number(n.carbs) : null;
      const f = n?.fats != null ? Number(n.fats) : null;

      const calP = clamp(pct(cal ?? 0, targets.calories), 0, 100);
      const pP = clamp(pct(p ?? 0, targets.protein), 0, 100);
      const cP = targets.carbs > 0 ? clamp(pct(c ?? 0, targets.carbs), 0, 100) : 0;
      const fP = targets.fats > 0 ? clamp(pct(f ?? 0, targets.fats), 0, 100) : 0;

      const parts: number[] = [calP, pP];
      if (targets.carbs > 0) parts.push(cP);
      if (targets.fats > 0) parts.push(fP);

      const avg = parts.reduce((a, b) => a + b, 0) / Math.max(1, parts.length);
      const adherence = Math.round(clamp(avg * 0.8 + calP * 0.2, 0, 100));
      const bonus = adherence >= 90 ? 20 : adherence >= 80 ? 10 : 0;
      const xp = targets.calories > 0 && targets.protein > 0 ? adherence + bonus : 0;
      sum += xp;
    }
    return sum;
  }, [nutrition14, targets.calories, targets.protein, targets.carbs, targets.fats]);

  const workoutXP14 = useMemo(() => workoutCompleteCount * 250, [workoutCompleteCount]);
  const totalXP14 = useMemo(() => workoutXP14 + nutritionXP14, [workoutXP14, nutritionXP14]);
  const player = useMemo(() => levelFromXP(totalXP14), [totalXP14]);

  /**
   * Avatar Stats (MVP-derived):
   * - Strength: workouts completed (until you tag strength vs cardio)
   * - Stamina: placeholder (0 now) — add when you track cardio minutes
   * - Health: nutrition XP normalized to 0–100
   */
  const strength = useMemo(() => clamp(workoutCompleteCount * 10, 0, 100), [workoutCompleteCount]);
  const stamina = useMemo(() => 0, []); // add later when you track cardio minutes
  const health = useMemo(() => clamp(Math.round(nutritionXP14 / 14), 0, 100), [nutritionXP14]);

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

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-emerald-300 drop-shadow-[0_0_18px_rgba(16,185,129,0.25)]">
          PROFILE
        </h1>
        <p className="mt-2 text-sm text-zinc-300">Account + avatar stats console.</p>

        <section className="mt-8 rounded-2xl border border-emerald-700/30 bg-zinc-950/40 p-6 shadow-[0_0_60px_rgba(16,185,129,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.9)]" />
              <div className="text-sm tracking-[0.14em] text-zinc-100">PLAYER_CONSOLE</div>
            </div>
            <div className="text-xs tracking-[0.18em] text-zinc-400">
              STATUS: <span className="text-emerald-300">READY</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5">
            {/* Identity */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-5">
              <div className="text-xs tracking-[0.16em] text-zinc-400">SIGNED_IN_AS</div>

              <div className="mt-3 flex flex-col gap-1">
                <div className="text-2xl font-bold text-zinc-100">{user?.name ?? "—"}</div>
                <div className="text-sm text-zinc-300">{user?.email ?? "—"}</div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ConsoleField label="USER_ID" value={user?.$id ? String(user.$id) : "—"} />
                <ConsoleField label="JOINED" value={joined} />
              </div>
            </div>

            {/* Player XP / Level */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.16em] text-zinc-400">PLAYER_STATS</div>
                  <div className="mt-2 text-sm text-zinc-300">
                    Built from your last 14 days (MVP). This will evolve as you add cardio + recovery tracking.
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/20 px-3 py-2 text-xs tracking-[0.16em] text-emerald-200">
                  LVL {player.level}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs tracking-[0.16em] text-zinc-400">XP (14D)</div>
                  <div className="text-xs text-zinc-400">{player.into} / {player.next}</div>
                </div>
                <div className="mt-2 text-2xl font-extrabold text-zinc-100">{totalXP14}</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-900/70">
                  <div
                    className="h-full rounded-full bg-emerald-400/60 shadow-[0_0_18px_rgba(52,211,153,0.35)]"
                    style={{ width: `${clamp((player.into / player.next) * 100, 0, 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Workout XP: {workoutXP14} • Nutrition XP: {nutritionXP14}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatBar
                  label="STRENGTH"
                  value={strength}
                  hint="MVP: based on completed workouts"
                />
                <StatBar
                  label="STAMINA"
                  value={stamina}
                  hint="Add cardio minutes to unlock"
                />
                <StatBar
                  label="HEALTH"
                  value={health}
                  hint="MVP: nutrition adherence"
                />
              </div>
            </div>

            {/* Progress Photos (placeholder) */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.16em] text-zinc-400">PROGRESS_PHOTOS</div>
                  <div className="mt-2 text-sm text-zinc-300">
                    Weekly photos → later we’ll generate your pixel “action-figure avatar” from stats + photos.
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs tracking-[0.16em] text-zinc-300">
                  COMING SOON
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ConsoleField label="PHOTO_SLOTS" value="LOCKED" hint="Upload flow not added yet" />
                <ConsoleField label="AVATAR_RENDER" value="LOCKED" hint="AI generation phase" />
              </div>

              <div className="mt-5 text-xs text-zinc-500">
                DB note: you’ll likely add an <span className="text-zinc-300">avatar_profiles</span> doc and a{" "}
                <span className="text-zinc-300">progress_photos</span> collection (Appwrite Storage + metadata).
              </div>
            </div>

            {/* Preferences (kept) */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.16em] text-zinc-400">PREFERENCES</div>
                  <div className="mt-2 text-sm text-zinc-300">
                    Coming next: units (lbs/kg), weekly schedule, notifications.
                  </div>
                </div>
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
                  to="/progress"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/30 sm:w-auto"
                >
                  VIEW PROGRESS
                </Link>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-zinc-500">
          Tip: The avatar gets stronger from consistency, not perfection.
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
      {props.hint ? <div className="mt-1 text-xs text-zinc-500">{props.hint}</div> : null}
    </div>
  );
}
