// app/routes/profile.tsx
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import { getCurrentUser } from "~/services/auth.client";

type User = any;

export default function ProfileRoute() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        setLoading(true);

        const u = await getCurrentUser();
        if (!u) {
          navigate("/login", { replace: true });
          return;
        }

        setUser(u);
        setLoading(false);
      } catch (e: any) {
        console.error("[profile] error:", e);
        setError(e?.message ?? "Failed to load profile.");
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) return <div className="text-sm text-zinc-300">Loading…</div>;

  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* PAGE HEADER (per-page). AppShell is already the global top bar. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p className="mt-1 text-sm text-zinc-300">Account + preferences</p>
        </div>

        <Link
          to="/today"
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
        >
          Back
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="text-xs text-zinc-400">Signed in as</div>
          <div className="mt-2 text-lg font-semibold text-zinc-100">
            {user?.name ?? "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-300">{user?.email ?? "—"}</div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="User ID" value={user?.$id ? String(user.$id) : "—"} />
            <Field
              label="Joined"
              value={user?.$createdAt ? new Date(user.$createdAt).toLocaleString() : "—"}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-base font-semibold">Preferences (MVP)</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Coming next: units (lbs/kg), weekly schedule, notifications.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-xs text-zinc-400">{props.label}</div>
      <div className="mt-1 text-sm text-zinc-100">{props.value}</div>
    </div>
  );
}
