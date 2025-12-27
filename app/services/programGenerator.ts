// app/services/programGenerator.ts
import { ID } from "appwrite";
import { databases } from "~/lib/appwrite.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

const COL_PROGRAM_DAYS = import.meta.env.VITE_COL_PROGRAM_DAYS as string;
const COL_PROGRAM_EXERCISES = import.meta.env
  .VITE_COL_PROGRAM_EXERCISES as string;

function assertEnv() {
  if (!DB_ID || !COL_PROGRAM_DAYS || !COL_PROGRAM_EXERCISES) {
    throw new Error(
      "[ENV] Missing VITE_APPWRITE_DATABASE_ID or program_days/program_exercises collection env vars"
    );
  }
}

type DayType =
  | "upper_strength"
  | "lower_strength"
  | "upper_hypertrophy"
  | "lower_hypertrophy";

type HingeMode = "deadlift" | "paused_rdl";

type ExerciseSeed = {
  name: string;
  category: "compound" | "accessory" | "core";
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: number;
  notes?: string;
  substitutions?: string[];
};

function deloadify(ex: ExerciseSeed): ExerciseSeed {
  // ~50% set reduction, higher RIR
  const sets = Math.max(1, Math.ceil(ex.sets / 2));
  return {
    ...ex,
    sets,
    rirTarget: Math.max(ex.rirTarget, 4),
    notes: ex.notes ? `${ex.notes} (DELOAD)` : "DELOAD",
  };
}

function getDayLabel(dayType: DayType) {
  switch (dayType) {
    case "upper_strength":
      return "Day 1 – Upper Strength";
    case "lower_strength":
      return "Day 2 – Lower Strength";
    case "upper_hypertrophy":
      return "Day 3 – Upper Hypertrophy";
    case "lower_hypertrophy":
      return "Day 4 – Lower Hypertrophy";
  }
}

function seedExercises(dayType: DayType, hingeMode: HingeMode): ExerciseSeed[] {
  if (dayType === "upper_strength") {
    return [
      {
        name: "Incline Press (BB or DB)",
        category: "compound",
        sets: 4,
        repMin: 4,
        repMax: 6,
        rirTarget: 2,
      },
      {
        name: "Pull-ups (weighted if able)",
        category: "compound",
        sets: 4,
        repMin: 4,
        repMax: 6,
        rirTarget: 2,
      },
      {
        name: "Bench Press (or machine press)",
        category: "compound",
        sets: 3,
        repMin: 5,
        repMax: 8,
        rirTarget: 2,
      },
      {
        name: "Chest-supported Row",
        category: "compound",
        sets: 3,
        repMin: 5,
        repMax: 8,
        rirTarget: 2,
      },
      {
        name: "Lateral Raise",
        category: "accessory",
        sets: 3,
        repMin: 10,
        repMax: 15,
        rirTarget: 1,
      },
      {
        name: "Triceps Pressdown",
        category: "accessory",
        sets: 2,
        repMin: 8,
        repMax: 12,
        rirTarget: 1,
      },
      {
        name: "Curl (optional)",
        category: "accessory",
        sets: 2,
        repMin: 8,
        repMax: 12,
        rirTarget: 1,
      },
    ];
  }

  if (dayType === "lower_strength") {
    return [
      {
        name: "Back Squat",
        category: "compound",
        sets: 4,
        repMin: 4,
        repMax: 6,
        rirTarget: 2,
      },
      hingeMode === "deadlift"
        ? {
            name: "Conventional Deadlift (top set + 2 backoffs)",
            category: "compound",
            sets: 3,
            repMin: 3,
            repMax: 5,
            rirTarget: 2,
            notes: "Top set 1×3–5 @ 1–2 RIR, then 2 backoffs @ 2–3 RIR",
          }
        : {
            name: "Paused RDL (2-sec pause mid-shin)",
            category: "compound",
            sets: 3,
            repMin: 5,
            repMax: 8,
            rirTarget: 2,
          },
      {
        name: "Leg Press",
        category: "compound",
        sets: 3,
        repMin: 6,
        repMax: 10,
        rirTarget: 2,
      },
      {
        name: "Hamstring Curl",
        category: "accessory",
        sets: 3,
        repMin: 8,
        repMax: 12,
        rirTarget: 1,
      },
      {
        name: "Calves",
        category: "accessory",
        sets: 4,
        repMin: 8,
        repMax: 12,
        rirTarget: 1,
      },
      {
        name: "Ab Wheel",
        category: "core",
        sets: 3,
        repMin: 6,
        repMax: 12,
        rirTarget: 2,
      },
      {
        name: "Back Extensions (45°/GHD)",
        category: "core",
        sets: 2,
        repMin: 10,
        repMax: 15,
        rirTarget: 2,
      },
    ];
  }

  if (dayType === "upper_hypertrophy") {
    return [
      {
        name: "DB Bench or Machine Press",
        category: "compound",
        sets: 3,
        repMin: 8,
        repMax: 12,
        rirTarget: 2,
      },
      {
        name: "Lat Pulldown",
        category: "compound",
        sets: 3,
        repMin: 10,
        repMax: 15,
        rirTarget: 2,
      },
      {
        name: "Cable Row / Machine Row",
        category: "compound",
        sets: 3,
        repMin: 8,
        repMax: 12,
        rirTarget: 2,
      },
      {
        name: "Seated DB Shoulder Press",
        category: "compound",
        sets: 3,
        repMin: 8,
        repMax: 12,
        rirTarget: 2,
      },
      {
        name: "Pec Deck / Cable Fly",
        category: "accessory",
        sets: 2,
        repMin: 12,
        repMax: 15,
        rirTarget: 1,
      },
      {
        name: "Lateral Raise",
        category: "accessory",
        sets: 3,
        repMin: 12,
        repMax: 20,
        rirTarget: 1,
      },
      {
        name: "Curl",
        category: "accessory",
        sets: 3,
        repMin: 10,
        repMax: 15,
        rirTarget: 1,
      },
      {
        name: "Overhead Rope Triceps",
        category: "accessory",
        sets: 3,
        repMin: 10,
        repMax: 15,
        rirTarget: 1,
      },
    ];
  }

  // lower_hypertrophy
  return [
    {
      name: "Hack Squat or Leg Press",
      category: "compound",
      sets: 4,
      repMin: 10,
      repMax: 15,
      rirTarget: 2,
    },
    {
      name: "Good Morning",
      category: "compound",
      sets: 3,
      repMin: 8,
      repMax: 12,
      rirTarget: 3,
      notes: "Always leave 2–3 RIR; progress reps before load",
    },
    {
      name: "Walking Lunge or Bulgarian Split Squat",
      category: "compound",
      sets: 3,
      repMin: 10,
      repMax: 12,
      rirTarget: 2,
    },
    {
      name: "Hamstring Curl",
      category: "accessory",
      sets: 3,
      repMin: 10,
      repMax: 15,
      rirTarget: 1,
    },
    {
      name: "Calves",
      category: "accessory",
      sets: 4,
      repMin: 10,
      repMax: 15,
      rirTarget: 1,
    },
    {
      name: "Pallof Press",
      category: "core",
      sets: 3,
      repMin: 12,
      repMax: 15,
      rirTarget: 2,
      notes: "Per side",
    },
    {
      name: "Farmer Carry (or DB holds)",
      category: "core",
      sets: 3,
      repMin: 40,
      repMax: 60,
      rirTarget: 2,
      notes: "Meters OR 30–45 sec holds",
    },
  ];
}

// ---------------------------
// Rate limit safe helpers
// ---------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(err: any) {
  const code = err?.code ?? err?.response?.code;
  return (
    code === 429 ||
    String(err?.message ?? "")
      .toLowerCase()
      .includes("rate limit")
  );
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 7;
  const baseDelayMs = opts?.baseDelayMs ?? 650;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt += 1;

      if (!isRateLimit(err) || attempt > maxRetries) {
        throw err;
      }

      // exponential backoff + jitter
      const jitter = Math.floor(Math.random() * 250);
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;

      console.warn(
        `[programGenerator] 429 rate limit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
      );
      await sleep(delay);
    }
  }
}

// Simple concurrency pool (no deps)
async function runPool<T, R>(
  items: T[],
  worker: (item: T, idx: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.max(1, concurrency) }, () =>
    runner()
  );
  await Promise.all(runners);
  return results;
}

async function safeCreateDocument(collectionId: string, payload: any) {
  return withBackoff(() =>
    databases.createDocument(DB_ID, collectionId, ID.unique(), payload)
  );
}

// ---------------------------
// Generator
// ---------------------------
export async function generate12WeekProgram(args: {
  programId: string;
  /**
   * Optional: low concurrency reduces 429s.
   * Start at 2–3. If you still see 429, set to 1–2.
   */
  exerciseConcurrency?: number;
  /**
   * Optional: progress callback for UI (e.g. "Creating exercise 120/420")
   */
  onProgress?: (p: {
    phase: "day" | "exercise";
    created: number;
    total: number;
    message?: string;
  }) => void;
}) {
  assertEnv();

  const { programId } = args;
  const exerciseConcurrency = Math.max(
    1,
    Math.min(args.exerciseConcurrency ?? 3, 5)
  );
  const onProgress = args.onProgress;

  const dayTypes: DayType[] = [
    "upper_strength",
    "lower_strength",
    "upper_hypertrophy",
    "lower_hypertrophy",
  ];

  // Precompute totals for nicer progress (optional)
  const totalDays: number = 12 * dayTypes.length;

  const totalExercisesEstimate: number = Array.from(
    { length: 12 },
    (_, wIdx) => {
      const week = wIdx + 1;
      const hingeMode: HingeMode = week % 2 === 1 ? "deadlift" : "paused_rdl";

      // ✅ force accumulator to be number
      return dayTypes.reduce<number>(
        (acc, dt) => acc + seedExercises(dt, hingeMode).length,
        0
      );
    }
  ).reduce((sum, n) => sum + n, 0);

  let createdDays = 0;
  let createdExercises = 0;

  for (let week = 1; week <= 12; week++) {
    const isDeload = week === 6;
    const hingeMode: HingeMode = week % 2 === 1 ? "deadlift" : "paused_rdl"; // odd=deadlift

    for (let i = 0; i < dayTypes.length; i++) {
      const dayType = dayTypes[i];
      const dayLabel = getDayLabel(dayType);
      const orderIndex = i + 1;

      // Create day (rate-limit safe)
      const dayDoc = await safeCreateDocument(COL_PROGRAM_DAYS, {
        programId,
        weekNumber: week,
        dayLabel,
        dayType,
        isDeload,
        hingeMode: dayType === "lower_strength" ? hingeMode : null,
        orderIndex,
      });

      createdDays += 1;
      onProgress?.({
        phase: "day",
        created: createdDays,
        total: totalDays,
        message: `Created ${dayLabel} (Week ${week})`,
      });

      const baseExercises = seedExercises(dayType, hingeMode);
      const exercises = isDeload ? baseExercises.map(deloadify) : baseExercises;

      // Build payloads first
      const payloads = exercises.map((ex, exIdx) => ({
        programDayId: (dayDoc as any).$id,
        name: ex.name,
        category: ex.category,
        sets: ex.sets,
        repMin: ex.repMin,
        repMax: ex.repMax,
        rirTarget: ex.rirTarget,
        notes: ex.notes ?? null,
        substitutions: ex.substitutions ?? [],
        orderIndex: exIdx + 1,
      }));

      // Create exercises using limited concurrency + backoff
      await runPool(
        payloads,
        async (payload, idx) => {
          // tiny pacing to reduce bursts (every 20 writes)
          if (idx > 0 && idx % 20 === 0) await sleep(200);

          const res = await safeCreateDocument(COL_PROGRAM_EXERCISES, payload);

          createdExercises += 1;
          onProgress?.({
            phase: "exercise",
            created: createdExercises,
            total: totalExercisesEstimate,
            message: `Created exercise ${createdExercises}/${totalExercisesEstimate}`,
          });

          return res;
        },
        exerciseConcurrency
      );
    }
  }

  return { createdDays, createdExercises };
}
