// app/routes/app.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { getCurrentUser } from "~/services/auth.client";
import { getActiveProgram } from "~/services/programs.client";

export default function AppGate() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const program = await getActiveProgram();
      if (!program) {
        navigate("/onboarding", { replace: true });
        return;
      }

      navigate("/today", { replace: true });
    })();
  }, [navigate]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-zinc-300">Loading your program…</p>
      </div>
    </main>
  );
}
