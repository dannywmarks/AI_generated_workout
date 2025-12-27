// app/components/AppShell.tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { AppNav } from "~/components/AppNav";
import { User, LogOut } from "lucide-react";

export function AppShell(props: {
  rightSlot?: ReactNode; // optional override (rarely needed now)
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top App Bar (GLOBAL) */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          {/* Brand */}
          <div className="min-w-0">
            <div className="relative select-none">
              {/* “glitch” layers */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 -translate-x-[1px] -translate-y-[1px] opacity-30 blur-[0.3px]"
                style={{
                  fontFamily: '"Press Start 2P", ui-sans-serif, system-ui',
                }}
              >
                DAMAGE PLAN
              </span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 translate-x-[1px] translate-y-[1px] opacity-20 blur-[0.6px]"
                style={{
                  fontFamily: '"Press Start 2P", ui-sans-serif, system-ui',
                }}
              >
                DAMAGE PLAN
              </span>

              {/* main title */}
              <span
                className="truncate text-base font-semibold tracking-wide sm:text-lg"
                style={{
                  fontFamily: '"Press Start 2P", ui-sans-serif, system-ui',
                }}
              >
                DAMAGE PLAN
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {props.rightSlot ? (
              props.rightSlot
            ) : (
              <>
                <Link
                  to="/profile"
                  aria-label="Profile"
                  title="Profile"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <User className="h-5 w-5" />
                </Link>

                <Link
                  to="/logout"
                  aria-label="Logout"
                  title="Logout"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <LogOut className="h-5 w-5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-4xl px-6 py-6 pb-24">{props.children}</main>

      {/* Bottom Nav */}
      <AppNav />
    </div>
  );
}
