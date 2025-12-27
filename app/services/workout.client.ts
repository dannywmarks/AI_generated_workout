// app/services/workouts.client.ts
import { ID, Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { isoDate } from "~/services/programs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_WORKOUT_LOGS = import.meta.env.VITE_COL_WORKOUT_LOGS as string;
const COL_SET_LOGS = import.meta.env.VITE_COL_SET_LOGS as string;

function assertEnv() {
  if (!DB_ID || !COL_WORKOUT_LOGS || !COL_SET_LOGS) {
    throw new Error("[ENV] Missing DB or workout_logs/set_logs collection env vars");
  }
}

export type WorkoutLog = {
  $id: string;
  userId: string;
  programId: string;
  programDayId: string;
  date: string; // YYYY-MM-DD
  startedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
};

export type SetLog = {
  $id: string;
  workoutLogId: string;
  programExerciseId: string;
  setIndex: number; // 1..N
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  notes?: string | null;
  completed: boolean;
  updatedAt?: string | null;
};

// Deterministic doc id so we can upsert without querying
function setLogId(workoutLogId: string, programExerciseId: string, setIndex: number) {
  // Keep it simple + stable. Appwrite allows custom IDs; keep under ~36-64 chars if possible.
  return `sl_${workoutLogId}_${programExerciseId}_${setIndex}`;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Rate-limit friendly pool runner (no extra deps)
 */
async function withConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = items.slice();
  const runners: Promise<void>[] = [];

  const runOne = async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await worker(item);
    }
  };

  for (let i = 0; i < Math.max(1, limit); i++) {
    runners.push(runOne());
  }

  await Promise.all(runners);
}

/**
 * One workout log per (userId, programDayId, date).
 * Create if missing.
 */
export async function getOrCreateWorkoutLog(args: {
  programId: string;
  programDayId: string;
  date?: string; // default today
}): Promise<WorkoutLog> {
  assertEnv();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const date = args.date ?? isoDate(new Date());

  const existing = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
    Query.equal("userId", user.$id),
    Query.equal("programDayId", args.programDayId),
    Query.equal("date", date),
    Query.limit(1),
  ]);

  const found = (existing.documents?.[0] as any) ?? null;
  if (found) return found as WorkoutLog;

  return (await databases.createDocument(DB_ID, COL_WORKOUT_LOGS, ID.unique(), {
    userId: user.$id,
    programId: args.programId,
    programDayId: args.programDayId,
    date,
    startedAt: nowIso(),
    completedAt: null,
    notes: null,
  })) as any;
}

export async function markWorkoutComplete(workoutLogId: string) {
  assertEnv();
  return databases.updateDocument(DB_ID, COL_WORKOUT_LOGS, workoutLogId, {
    completedAt: nowIso(),
  } as any);
}

export async function listSetLogs(workoutLogId: string): Promise<SetLog[]> {
  assertEnv();
  const res = await databases.listDocuments(DB_ID, COL_SET_LOGS, [
    Query.equal("workoutLogId", workoutLogId),
    Query.limit(500),
  ]);
  return (res.documents as any) ?? [];
}

export type SetLogInput = Omit<SetLog, "$id" | "updatedAt"> & {
  // ensure required fields exist
  workoutLogId: string;
  programExerciseId: string;
  setIndex: number;
  completed: boolean;
};

async function upsertSetLogOne(input: SetLogInput) {
  assertEnv();

  const docId = setLogId(input.workoutLogId, input.programExerciseId, input.setIndex);
  const payload = {
    ...input,
    updatedAt: nowIso(),
  };

  try {
    // try create with deterministic id
    await databases.createDocument(DB_ID, COL_SET_LOGS, ID.custom(docId), payload as any);
  } catch (e: any) {
    // If already exists (409 conflict), update
    const msg = String(e?.message ?? "");
    const isConflict =
      e?.code === 409 ||
      msg.toLowerCase().includes("already exists") ||
      msg.toLowerCase().includes("conflict");

    if (!isConflict) throw e;

    await databases.updateDocument(DB_ID, COL_SET_LOGS, docId, payload as any);
  }
}

/**
 * Bulk upsert with concurrency to avoid 429s.
 * Tune concurrency 2–5 depending on your Appwrite plan/limits.
 */
export async function upsertSetLogsBulk(inputs: SetLogInput[], concurrency = 3) {
  assertEnv();
  await withConcurrency(inputs, concurrency, async (item) => {
    await upsertSetLogOne(item);
  });
}
