import { ID, Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_NUTRITION_LOGS = import.meta.env.VITE_COL_NUTRITION_LOGS as string;

function assertEnv() {
  if (!DB_ID || !COL_NUTRITION_LOGS) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_NUTRITION_LOGS");
  }
}

export function isoDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type NutritionLog = {
  $id: string;
  userId: string;
  programId: string;
  dateIso: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  notes?: string | null;
};

export async function getOrCreateNutritionLog(args: {
  programId: string;
  dateIso?: string;
}): Promise<NutritionLog> {
  assertEnv();

  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const date = args.dateIso ?? isoDate(new Date());

  const existing = await databases.listDocuments(DB_ID, COL_NUTRITION_LOGS, [
    Query.equal("userId", user.$id),
    Query.equal("programId", args.programId),
    Query.equal("dateIso", date),
    Query.limit(1),
  ]);

  const found = (existing.documents?.[0] as any) as NutritionLog | undefined;
  if (found) return found;

  const created = await databases.createDocument(DB_ID, COL_NUTRITION_LOGS, ID.unique(), {
    userId: user.$id,
    programId: args.programId,
    dateIso: date,
    calories: null,
    protein: null,
    carbs: null,
    fats: null,
    notes: null,
  });

  return created as any;
}

export async function updateNutritionLog(
  logId: string,
  patch: Partial<Omit<NutritionLog, "$id" | "userId" | "programId" | "dateIso">>,
) {
  assertEnv();
  return databases.updateDocument(DB_ID, COL_NUTRITION_LOGS, logId, patch as any);
}

export async function listNutritionLogs(args: {
  programId: string;
  startIso?: string;
  limit?: number;
}): Promise<NutritionLog[]> {
  assertEnv();

  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const queries = [
    Query.equal("userId", user.$id),
    Query.equal("programId", args.programId),
    Query.orderDesc("dateIso"),
    Query.limit(args.limit ?? 30),
  ];

  // Optional start bound (only works if you also store end bound; keeping simple)
  if (args.startIso) {
    queries.unshift(Query.greaterThanEqual("dateIso", args.startIso));
  }

  const res = await databases.listDocuments(DB_ID, COL_NUTRITION_LOGS, queries);
  return (res.documents as any) as NutritionLog[];
}
