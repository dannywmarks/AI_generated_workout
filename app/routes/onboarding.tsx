// app/routes/onboarding.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getCurrentUser } from "~/services/auth.client";
import {
  getActiveProgram,
  createProgram,
  isoDate,
} from "~/services/programs.client";
import { upsertMyProfile } from "~/services/profile.client";
import { generate12WeekProgram } from "~/services/programGenerator";

type Experience = "beginner" | "intermediate" | "advanced";
type GymAccess = "full" | "mixed" | "hotel";
type CardioPref = "row" | "steps" | "otherZone2";

export default function OnboardingRoute() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Minimal onboarding (expand later)
  const [displayName, setDisplayName] = useState("");
  const [heightIn, setHeightIn] = useState<number>(68);
  const [startWeight, setStartWeight] = useState<number>(202);
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [daysPerWeek, setDaysPerWeek] = useState<3 | 4>(4);
  const [gymAccess, setGymAccess] = useState<GymAccess>("mixed");

  // ✅ UPDATED to match Appwrite enum
  const [cardioPref, setCardioPref] = useState<CardioPref>("row");
  const [rowSessionsPerWeek, setRowSessionsPerWeek] = useState<number>(3);
  const [rowMinutes, setRowMinutes] = useState<number>(40);
  const [stepGoal, setStepGoal] = useState<number>(10000);

  // Nutrition defaults (you can tune later)
  const [trainingCalories, setTrainingCalories] = useState<number>(3100);
  const [restCalories, setRestCalories] = useState<number>(2900);
  const [proteinTarget, setProteinTarget] = useState<number>(190);

  const templateKey = useMemo(() => {
    return daysPerWeek === 3
      ? "recomp_ul_3day_rotation_v1"
      : "recomp_ul_4day_v1";
  }, [daysPerWeek]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const active = await getActiveProgram();
      if (active) {
        navigate("/today", { replace: true });
        return;
      }

      setLoading(false);
    })();
  }, [navigate]);

  async function onCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // 1) Save profile
      await upsertMyProfile({
        displayName: displayName || undefined,
        heightIn,
        startWeight,
        experience,
        daysPerWeek,
        sessionMinutes: 75,
        gymAccess,
        cardioPref, // ✅ now row/steps/otherZone2
        rowSessionsPerWeek,
        rowMinutes,
        stepGoal,
        goal: "recomp",
        supplements: ["creatine", "protein"],
        trtEnabled: false,
      });

      // 2) Create program record
      const prog = await createProgram({
        templateKey,
        startDate: isoDate(new Date()),
        status: "active",
        daysPerWeek,
        currentDayIndex: 0,
        trainingDayCalories: trainingCalories,
        restDayCalories: restCalories,
        proteinTarget,
        stepGoal,
        rowSessionsPerWeek,
        rowMinutes,
        // optional macro breakdown fields (you can compute later)
        fatsTraining: 85,
        fatsRest: 90,
      });

      // 3) Generate 12-week plan docs
      await generate12WeekProgram({ programId: (prog as any).$id });

      // 4) Go to Today
      navigate("/today", { replace: true });
    } catch (err: any) {
      console.error("[onboarding] error:", err);
      setError(err?.message ?? "Failed to create program.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-2xl px-6 py-16">Loading…</div>
      </main>
    );
  }

  // Optional: show/hide cardio fields based on preference
  const showRowFields = cardioPref === "row" || cardioPref === "otherZone2";
  const showStepFields = cardioPref === "steps";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Program Setup</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Answer a few questions and we’ll generate your 12-week plan.
        </p>

        <form
          onSubmit={onCreateProgram}
          className="mt-8 space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-zinc-300">Name (optional)</span>
              <input
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Danny"
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Experience</span>
              <select
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                value={experience}
                onChange={(e) => setExperience(e.target.value as Experience)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Height (inches)</span>
              <input
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                type="number"
                value={heightIn}
                onChange={(e) => setHeightIn(Number(e.target.value))}
                min={48}
                max={84}
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Current weight (lb)</span>
              <input
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                type="number"
                value={startWeight}
                onChange={(e) => setStartWeight(Number(e.target.value))}
                min={80}
                max={400}
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Days per week</span>
              <select
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value) as 3 | 4)}
              >
                <option value={3}>3 days</option>
                <option value={4}>4 days</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Gym access</span>
              <select
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                value={gymAccess}
                onChange={(e) => setGymAccess(e.target.value as GymAccess)}
              >
                <option value="full">Full gym</option>
                <option value="mixed">Mixed (full + hotel)</option>
                <option value="hotel">Hotel only</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <h2 className="text-sm font-semibold">Cardio / Activity</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm text-zinc-300">Preference</span>
                <select
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  value={cardioPref}
                  onChange={(e) => setCardioPref(e.target.value as CardioPref)}
                >
                  {/* ✅ values match Appwrite enum exactly */}
                  <option value="row">Row (Zone 2)</option>
                  <option value="steps">Steps</option>
                  <option value="otherZone2">Other Zone 2</option>
                </select>
              </label>

              {showStepFields ? (
                <label className="block">
                  <span className="text-sm text-zinc-300">Step goal</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                    type="number"
                    value={stepGoal}
                    onChange={(e) => setStepGoal(Number(e.target.value))}
                    min={1000}
                    max={30000}
                  />
                </label>
              ) : (
                <div className="hidden sm:block" />
              )}

              {showRowFields ? (
                <label className="block">
                  <span className="text-sm text-zinc-300">
                    {cardioPref === "otherZone2"
                      ? "Zone 2 sessions / week"
                      : "Row sessions / week"}
                  </span>
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                    type="number"
                    value={rowSessionsPerWeek}
                    onChange={(e) =>
                      setRowSessionsPerWeek(Number(e.target.value))
                    }
                    min={0}
                    max={7}
                  />
                </label>
              ) : (
                <div className="hidden sm:block" />
              )}

              {showRowFields ? (
                <label className="block">
                  <span className="text-sm text-zinc-300">
                    {cardioPref === "otherZone2"
                      ? "Zone 2 minutes / session"
                      : "Row minutes / session"}
                  </span>
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                    type="number"
                    value={rowMinutes}
                    onChange={(e) => setRowMinutes(Number(e.target.value))}
                    min={10}
                    max={90}
                  />
                </label>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <h2 className="text-sm font-semibold">Nutrition targets</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm text-zinc-300">Training calories</span>
                <input
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  type="number"
                  value={trainingCalories}
                  onChange={(e) => setTrainingCalories(Number(e.target.value))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-zinc-300">Rest calories</span>
                <input
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  type="number"
                  value={restCalories}
                  onChange={(e) => setRestCalories(Number(e.target.value))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-zinc-300">Protein target (g)</span>
                <input
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  type="number"
                  value={proteinTarget}
                  onChange={(e) => setProteinTarget(Number(e.target.value))}
                  min={100}
                  max={260}
                />
              </label>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
          >
            {submitting ? "Generating program…" : "Create my 12-week program"}
          </button>

          <p className="text-xs text-zinc-400">
            This will generate 12 weeks of program days and exercises in Appwrite.
          </p>
        </form>
      </div>
    </main>
  );
}
