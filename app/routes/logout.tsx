// app/routes/logout.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { logoutCurrentSession } from "~/services/auth.client";

export default function LogoutRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      await logoutCurrentSession();
      navigate("/login", { replace: true });
    })();
  }, [navigate]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-md px-6 py-16">
        <p className="text-sm text-zinc-300">Signing you out…</p>
      </div>
    </main>
  );
}
