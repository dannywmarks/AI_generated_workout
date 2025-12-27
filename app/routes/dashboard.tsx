// app/routes/dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Query } from "appwrite";
import { databases } from "~/lib/appwrite.client";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_WORKOUT_LOGS = import.meta.env.VITE_COL_WORKOUT_LOGS as string;

function assertEnv() {
  if (!DB_ID || !COL_WORKOUT_LOGS) {
    throw new Error("[ENV] Missing VITE_APPWRITE_DATABASE_ID or VITE_COL_WORKOUT_LOGS");
  }
}

// Monday-start week ISO at 00:00:00
function isoStartOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

// Accepts "YYYY-MM-DD" OR full ISO, returns week 1..12
function diffWeeksSafe(startIso: string) {
  const datePart = String(startIso).slice(0, 10); // "YYYY-MM-DD"
  const start = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;

  const now = new Date();
  const ms = now.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const wk = Math.floor(days / 7) + 1;
  return Math.min(12, Math.max(1, wk));
}

/**
 * This powers the global header in routes/__app.tsx via useMatches().
 * Keep this static; put dynamic "Week X" info inside the page content.
 */
export const handle = {
  title: "Dashboard",
  subtitle: "Overview",
  // rightSlot: null, // AppShell will show default Profile + Logout
};

export default function DashboardRoute() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [completedTotal, setCompletedTotal] = useState<number>(0);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(0);
  const [lastWorkout, setLastWorkout] = useState<any>(null);

  const weekNumber = useMemo(() => {
    if (!program?.startDate) return 1;
    return diffWeeksSafe(program.startDate);
  }, [program]);

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

        // 1) Total completed workouts (use total, limit 1)
        const totalRes = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
          Query.equal("programId", active.$id),
          Query.equal("status", "complete"),
          Query.limit(1),
        ]);
        setCompletedTotal(Number((totalRes as any).total ?? 0));

        // 2) Completed this week
        const weekStart = isoStartOfWeek(new Date());

        try {
          const weekRes = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
            Query.equal("programId", active.$id),
            Query.equal("status", "complete"),
            Query.greaterThanEqual("$createdAt", weekStart),
            Query.limit(1),
          ]);
          setCompletedThisWeek(Number((weekRes as any).total ?? 0));
        } catch {
          // Fallback: pull last 100 completed and count client-side
          const weekRes2 = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
            Query.equal("programId", active.$id),
            Query.equal("status", "complete"),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ]);

          const docs = (weekRes2 as any).documents ?? [];
          const startMs = new Date(weekStart).getTime();
          const count = docs.filter((d: any) => new Date(d.$createdAt).getTime() >= startMs).length;
          setCompletedThisWeek(count);
        }

        // 3) Most recent workout log
        const lastRes = await databases.listDocuments(DB_ID, COL_WORKOUT_LOGS, [
          Query.equal("programId", active.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(1),
        ]);
        setLastWorkout(((lastRes as any).documents?.[0] as any) ?? null);

        setLoading(false);
      } catch (e: any) {
        console.error("[dashboard] error:", e);
        setError(e?.message ?? "Failed to load dashboard.");
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) {
    return <div className="text-sm text-zinc-300">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Small page header block INSIDE content (optional), since the global header is sticky */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-zinc-300">
              {program?.startDate ? (
                <>
                  Week <span className="text-zinc-100 font-medium">{weekNumber}</span> of 12
                  {program?.templateKey ? (
                    <>
                      {" "}
                      • Program:{" "}
                      <span className="text-zinc-100 font-medium">
                        {String(program.templateKey)}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                "No active program found."
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to="/today"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
            >
              Go to Today
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Workouts completed (total)" value={completedTotal} />
        <StatCard label="Workouts completed (this week)" value={completedThisWeek} />
        <StatCard label="Training calories" value={program?.trainingDayCalories ?? 0} suffix="kcal" />
        <StatCard label="Protein target" value={program?.proteinTarget ?? 0} suffix="g" />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-base font-semibold">Most recent workout</h2>

        {lastWorkout ? (
          <div className="mt-2 text-sm text-zinc-300">
            <div>
              Status:{" "}
              <span className="text-zinc-100">{String(lastWorkout.status ?? "—")}</span>
            </div>
            <div className="mt-1">
              Created:{" "}
              <span className="text-zinc-100">
                {new Date(lastWorkout.$createdAt).toLocaleString()}
              </span>
            </div>

            {lastWorkout.programDayId ? (
              <div className="mt-4">
                <Link
                  to={`/workout/${lastWorkout.programDayId}`}
                  className="inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
                >
                  Open last workout
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-400">
                (No programDayId on this log — store it on the workout log to deep link.)
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">
            No workout logs yet. Do your first workout and it’ll show here.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard(props: { label: string; value: number; suffix?: string }) {
  const { label, value, suffix } = props;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">
        {Number.isFinite(value) ? value : 0}
        {suffix ? <span className="ml-2 text-sm text-zinc-400">{suffix}</span> : null}
      </div>
    </div>
  );
}
