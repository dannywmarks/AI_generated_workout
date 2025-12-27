// app/services/programs.client.ts
import { ID, Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

const COL_PROGRAMS = import.meta.env.VITE_COL_PROGRAMS as string;

function assertEnv() {
  if (!DB_ID || !COL_PROGRAMS) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_PROGRAMS");
  }
}

export type Program = {
  $id: string;
  userId: string;
  templateKey: string;
  startDate: string; // ISO (YYYY-MM-DD)
  status: "active" | "paused" | "complete";
  daysPerWeek: number; // 3 or 4
  currentDayIndex?: number; // for 3-day rotation (0..3)
  trainingDayCalories: number;
  restDayCalories: number;
  proteinTarget: number;
  fatsTraining?: number;
  carbsTraining?: number;
  fatsRest?: number;
  carbsRest?: number;
  stepGoal: number;
  rowSessionsPerWeek: number;
  rowMinutes: number;
};

export function isoDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function getActiveProgram(): Promise<Program | null> {
  assertEnv();
  const user = await getCurrentUser();
  if (!user) return null;

  const res = await databases.listDocuments(DB_ID, COL_PROGRAMS, [
    Query.equal("userId", user.$id),
    Query.equal("status", "active"),
    Query.limit(1),
  ]);

  return (res.documents?.[0] as any) ?? null;
}

export async function createProgram(input: Omit<Program, "$id" | "userId">) {
  assertEnv();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return databases.createDocument(DB_ID, COL_PROGRAMS, ID.unique(), {
    userId: user.$id,
    ...input,
  });
}

export async function updateProgram(programId: string, patch: Partial<Program>) {
  assertEnv();
  return databases.updateDocument(DB_ID, COL_PROGRAMS, programId, patch as any);
}
