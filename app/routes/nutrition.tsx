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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function toNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function pct(value: number | null | undefined, target: number | null | undefined) {
  if (!target || target <= 0) return 0;
  if (value == null || !Number.isFinite(value)) return 0;
  return clamp((value / target) * 100, 0, 125);
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

function ProgressBar(props: { label: string; value: number; target: number; suffix?: string }) {
  const p = pct(props.value, props.target);
  const over = props.value > props.target && props.target > 0;

  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/35 p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
            {props.label}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-zinc-100">
            {props.value}
            {props.suffix ?? ""}{" "}
            <span className="text-zinc-500">/ {props.target}{props.suffix ?? ""}</span>
          </div>
        </div>
        <div className="shrink-0 text-xs tracking-[0.16em] text-zinc-400">
          {Math.round(p)}%
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-900/70">
        <div
          className={[
            "h-full rounded-full",
            over ? "bg-emerald-200/70" : "bg-emerald-400/60",
            "shadow-[0_0_18px_rgba(52,211,153,0.35)]",
          ].join(" ")}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Targets:
 * - Prefer program.calorie/protein/carbs/fats targets if present
 * - Otherwise compute carbs/fats from calories + protein using a simple split:
 *   fats ≈ 25% calories, carbs = remainder
 */
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

  const fats = Math.max(35, Math.round((cal * 0.25) / 9)); // floor fats so you don’t go “too low”
  const remaining = cal - protein * 4 - fats * 9;
  const carbs = Math.max(0, Math.round(remaining / 4));

  return { calories: cal, protein, carbs, fats };
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

  const targets = useMemo(() => computeMacroTargets(program), [program]);

  const vCalories = useMemo(() => toNum(calories) ?? 0, [calories]);
  const vProtein = useMemo(() => toNum(protein) ?? 0, [protein]);
  const vCarbs = useMemo(() => toNum(carbs) ?? 0, [carbs]);
  const vFats = useMemo(() => toNum(fats) ?? 0, [fats]);

  // MVP adherence score (0–100): average of macro % capped at 100, calories weighted slightly more
  const adherence = useMemo(() => {
    const calP = clamp(pct(vCalories, targets.calories), 0, 100);
    const pP = clamp(pct(vProtein, targets.protein), 0, 100);
    const cP = targets.carbs > 0 ? clamp(pct(vCarbs, targets.carbs), 0, 100) : 0;
    const fP = targets.fats > 0 ? clamp(pct(vFats, targets.fats), 0, 100) : 0;

    const parts: number[] = [calP, pP];
    if (targets.carbs > 0) parts.push(cP);
    if (targets.fats > 0) parts.push(fP);

    const avg = parts.reduce((a, b) => a + b, 0) / Math.max(1, parts.length);
    // tiny bias towards calories (feel free to tweak)
    return Math.round(clamp(avg * 0.8 + calP * 0.2, 0, 100));
  }, [targets, vCalories, vProtein, vCarbs, vFats]);

  // MVP XP from nutrition (0–120/day)
  const nutritionXP = useMemo(() => {
    // strong reward for being “close” without requiring perfection
    if (targets.calories <= 0 || targets.protein <= 0) return 0;
    const base = adherence; // 0–100
    const bonus = adherence >= 90 ? 20 : adherence >= 80 ? 10 : 0;
    return base + bonus;
  }, [adherence, targets.calories, targets.protein]);

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
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">Loading…</div>
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

      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Pill>NUTRITION_CONSOLE // DAMAGE PLAN</Pill>
          <Link
            to="/today"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 hover:bg-zinc-900/40"
          >
            BACK TO TODAY
          </Link>
        </div>

        <div className="mb-4">
          <div className="text-3xl font-extrabold tracking-tight text-emerald-200">
            NUTRITION LOG
          </div>
          <div className="mt-2 text-sm text-zinc-300">
            {program ? `Program: ${program.templateKey}` : ""}
            {dateIso ? ` • ${dateIso}` : ""}
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <Panel
          title="DAILY_TARGETS"
          right={
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className={[
                  "w-full rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200",
                  "shadow-[0_0_0_1px_rgba(16,185,129,0.14)] hover:bg-emerald-950/45 disabled:opacity-60",
                  "sm:w-auto",
                ].join(" ")}
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>

              <Link
                to="/progress"
                className={[
                  "w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200",
                  "hover:bg-zinc-900/40",
                  "sm:w-auto",
                ].join(" ")}
              >
                VIEW PROGRESS
              </Link>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">DATE</div>
              <HudInput
                className="mt-2"
                type="date"
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
              />
            </label>

            <div className="sm:col-span-2 rounded-xl border border-zinc-800/70 bg-zinc-950/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                    PROGRAM_TARGETS
                  </div>
                  <div className="mt-1 text-sm text-zinc-200">
                    Calories: <span className="font-semibold text-zinc-100">{targets.calories || "—"}</span>{" "}
                    • Protein: <span className="font-semibold text-zinc-100">{targets.protein || "—"}g</span>{" "}
                    • Carbs: <span className="font-semibold text-zinc-100">{targets.carbs || "—"}g</span>{" "}
                    • Fats: <span className="font-semibold text-zinc-100">{targets.fats || "—"}g</span>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/25 px-3 py-2 text-xs tracking-[0.16em] text-emerald-200">
                  XP +{nutritionXP}
                </div>
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                Targets come from your Program when available. Otherwise carbs/fats are computed from calories + protein.
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">CALORIES</div>
              <HudInput
                className="mt-2"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 2600"
              />
            </label>

            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">PROTEIN (G)</div>
              <HudInput
                className="mt-2"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 190"
              />
            </label>

            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">CARBS (G)</div>
              <HudInput
                className="mt-2"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 250"
              />
            </label>

            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">FATS (G)</div>
              <HudInput
                className="mt-2"
                value={fats}
                onChange={(e) => setFats(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 80"
              />
            </label>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProgressBar label="CALORIES" value={vCalories} target={targets.calories} />
            <ProgressBar label="PROTEIN" value={vProtein} target={targets.protein} suffix="g" />
            <ProgressBar label="CARBS" value={vCarbs} target={targets.carbs} suffix="g" />
            <ProgressBar label="FATS" value={vFats} target={targets.fats} suffix="g" />
          </div>

          <div className="mt-6 rounded-xl border border-zinc-800/70 bg-zinc-950/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  ADHERENCE_SCORE
                </div>
                <div className="mt-1 text-sm text-zinc-200">
                  {adherence}%{" "}
                  <span className="text-zinc-500">
                    (XP +{nutritionXP} today)
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-xs tracking-[0.16em] text-zinc-400">
                {adherence >= 90 ? "S-RANK" : adherence >= 80 ? "A-RANK" : adherence >= 65 ? "B-RANK" : "C-RANK"}
              </div>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-900/70">
              <div
                className="h-full rounded-full bg-emerald-400/60 shadow-[0_0_18px_rgba(52,211,153,0.35)]"
                style={{ width: `${clamp(adherence, 0, 100)}%` }}
              />
            </div>

            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">NOTES</div>
              <HudTextArea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hunger, cravings, missed meal, travel day, etc."
                className="mt-2"
              />
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
