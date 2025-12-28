// app/components/AppShell.tsx
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { AppNav } from "~/components/AppNav";
import { User, LogOut } from "lucide-react";

import dpLogo from "../../public/DP_Logo.png";

export function AppShell(props: { rightSlot?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();

  const hideNav =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/" ||
    pathname.startsWith("/onboarding");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* subtle "CRT / arcade" background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.22]"
        style={{
          background:
            "radial-gradient(800px 500px at 50% 10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(900px 600px at 20% 80%, rgba(16,185,129,0.10), transparent 60%), linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 35%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.18] mix-blend-overlay"
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* Top App Bar (GLOBAL) */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          {/* Brand */}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={dpLogo}
                alt="Damage Plan"
                draggable={false}
                className={[
                  "block select-none object-contain",
                  "h-10 sm:h-12",
                  "max-w-[170px] sm:max-w-[220px]",
                ].join(" ")}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {props.rightSlot ? (
              props.rightSlot
            ) : (
              <>
                <Link
                  to="/profile"
                  aria-label="Profile"
                  title="Profile"
                  className="group inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-200 transition hover:border-emerald-600/60 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <User className="h-5 w-5 transition group-hover:scale-[1.03]" />
                </Link>

                <Link
                  to="/logout"
                  aria-label="Logout"
                  title="Logout"
                  className="group inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-200 transition hover:border-emerald-600/60 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <LogOut className="h-5 w-5 transition group-hover:scale-[1.03]" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6">
        {props.children}
      </main>

      {/* Bottom Nav */}
      {!hideNav ? <AppNav /> : null}
    </div>
  );
}
