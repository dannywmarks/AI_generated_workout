// app/services/workoutLogs.client.ts
import { ID, Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

const COL_WORKOUT_LOGS = import.meta.env.VITE_COL_WORKOUT_LOGS as string;
const COL_SET_LOGS = import.meta.env.VITE_COL_SET_LOGS as string;

function assertEnv() {
  if (!DB_ID || !COL_WORKOUT_LOGS || !COL_SET_LOGS) {
    throw new Error("[ENV] Missing DB_ID or VITE_COL_WORKOUT_LOGS / VITE_COL_SET_LOGS");
  }
}

export type WorkoutStatus = "in_progress" | "complete";

export type WorkoutLog = {
  $id: string;
  userId: string;
  programId: string;
  programDayId: string;
  dateIso: string; // YYYY-MM-DD
  status: WorkoutStatus;
  notes?: string | null;
};

export type SetLog = {
  $id: string;
  workoutLogId: string;
  programExerciseId: string;
  setNumber: number;
  reps?: number | null;
  weight?: number | null;
  rir?: number | null;
  notes?: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retries Appwrite calls on 429 with backoff.
 * Keeps it small + safe for client-side.
 */
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.code ?? e?.response?.status;
      if (code !== 429 || attempt >= tries - 1) throw e;
      // basic exponential backoff + jitter
      const wait = Math.min(4000, 250 * Math.pow(2, attempt)) + Math.floor(Math.random() * 200);
      await sleep(wait);
      attempt++;
    }
  }
}

/**
 * Simple concurrency limiter to avoid rate limiting.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export function isoDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function getOrCreateWorkoutLog(args: {
  programId: string;
  programDayId: string;
  dateIso?: string;
}): Promise<WorkoutLog> {
  assertEnv();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const date = args.dateIso ?? isoDate(new Date());

  const existing = await withRetry(() =>
    databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
      Query.equal("userId", user.$id),
      Query.equal("programId", args.programId),
      Query.equal("programDayId", args.programDayId),
      Query.equal("dateIso", date),
      Query.limit(1),
    ]),
  );

  const found = (existing.documents?.[0] as any) as WorkoutLog | undefined;
  if (found) return found;

  const created = await withRetry(() =>
    databases.createDocument(DB_ID, COL_WORKOUT_LOGS, ID.unique(), {
      userId: user.$id,
      programId: args.programId,
      programDayId: args.programDayId,
      dateIso: date,
      status: "in_progress",
      notes: null,
    }),
  );

  return created as any;
}

export async function updateWorkoutLog(workoutLogId: string, patch: Partial<WorkoutLog>) {
  assertEnv();
  return withRetry(() =>
    databases.updateDocument(DB_ID, COL_WORKOUT_LOGS, workoutLogId, patch as any),
  );
}

export async function listSetLogs(workoutLogId: string): Promise<SetLog[]> {
  assertEnv();
  const res = await withRetry(() =>
    databases.listDocuments(DB_ID, COL_SET_LOGS, [
      Query.equal("workoutLogId", workoutLogId),
      Query.orderAsc("programExerciseId"),
      Query.orderAsc("setNumber"),
      Query.limit(500),
    ]),
  );

  return (res.documents as any) ?? [];
}

export type UpsertSetInput = {
  programExerciseId: string;
  setNumber: number;
  reps?: number | null;
  weight?: number | null;
  rir?: number | null;
  notes?: string | null;
};

/**
 * Upsert set logs by (programExerciseId, setNumber).
 * Uses throttled writes + retry to avoid 429.
 */
export async function upsertSetLogs(args: {
  workoutLogId: string;
  sets: UpsertSetInput[];
}) {
  assertEnv();

  // index existing
  const existing = await listSetLogs(args.workoutLogId);
  const key = (s: { programExerciseId: string; setNumber: number }) =>
    `${s.programExerciseId}::${s.setNumber}`;

  const existingMap = new Map<string, SetLog>();
  for (const s of existing) existingMap.set(key(s), s);

  // small concurrency helps a lot for Appwrite endpoint limits
  await runWithConcurrency(args.sets, 2, async (s) => {
    const k = key(s);
    const found = existingMap.get(k);

    if (found) {
      await withRetry(() =>
        databases.updateDocument(DB_ID, COL_SET_LOGS, found.$id, {
          reps: s.reps ?? null,
          weight: s.weight ?? null,
          rir: s.rir ?? null,
          notes: s.notes ?? null,
        }),
      );
    } else {
      await withRetry(() =>
        databases.createDocument(DB_ID, COL_SET_LOGS, ID.unique(), {
          workoutLogId: args.workoutLogId,
          programExerciseId: s.programExerciseId,
          setNumber: s.setNumber,
          reps: s.reps ?? null,
          weight: s.weight ?? null,
          rir: s.rir ?? null,
          notes: s.notes ?? null,
        }),
      );
    }
  });
}
