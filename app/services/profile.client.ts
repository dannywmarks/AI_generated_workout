// app/services/profile.client.ts
import { ID, Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_PROFILES = import.meta.env.VITE_COL_PROFILES as string;

function assertEnv() {
  if (!DB_ID || !COL_PROFILES) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_PROFILES");
  }
}

// ✅ Appwrite enum values
export type CardioPref = "row" | "steps" | "otherZone2";

export type Profile = {
  $id: string;
  userId: string;
  displayName?: string;
  heightIn?: number;
  startWeight?: number;
  goal?: "recomp" | "cut" | "gain";
  experience?: "beginner" | "intermediate" | "advanced";
  daysPerWeek?: number;
  sessionMinutes?: number;
  gymAccess?: "full" | "mixed" | "hotel";
  cardioPref?: CardioPref;
  rowSessionsPerWeek?: number;
  rowMinutes?: number;
  stepGoal?: number;
  trtEnabled?: boolean;
  supplements?: string[];
};

function normalizeCardioPref(input: any): CardioPref | undefined {
  if (input == null) return undefined;

  if (Array.isArray(input)) input = input[0];
  if (typeof input === "object") {
    input = input.value ?? input.id ?? input.key ?? input.label;
  }

  const v = String(input).trim();

  // ✅ allowed values
  if (v === "row" || v === "steps" || v === "otherZone2") return v;

  // Backwards compatibility (in case any older UI code still exists)
  if (v === "rowZone2") return "row";
  if (v === "both") return "otherZone2";

  throw new Error(`Invalid cardioPref: ${JSON.stringify(input)}`);
}

export async function getMyProfile(): Promise<Profile | null> {
  assertEnv();
  const user = await getCurrentUser();
  if (!user) return null;

  const res = await databases.listDocuments(DB_ID, COL_PROFILES, [
    Query.equal("userId", user.$id),
    Query.limit(1),
  ]);

  return (res.documents?.[0] as any) ?? null;
}

export async function upsertMyProfile(input: Omit<Profile, "$id" | "userId">) {
  assertEnv();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const existing = await getMyProfile();
  const payload = {
    userId: user.$id,
    ...input,
    cardioPref: normalizeCardioPref((input as any).cardioPref),
  };

  if (existing) {
    return databases.updateDocument(DB_ID, COL_PROFILES, (existing as any).$id, payload);
  }

  return databases.createDocument(DB_ID, COL_PROFILES, ID.unique(), payload);
}
