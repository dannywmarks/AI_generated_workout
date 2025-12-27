// app/routes.ts
import type { RouteConfig } from "@react-router/dev/routes";

const routes: RouteConfig = [
  // ===== Public =====
  { path: "/", file: "./routes/_index.tsx" },
  { path: "/login", file: "./routes/login.tsx" },
  { path: "/register", file: "./routes/register.tsx" },
  { path: "/logout", file: "./routes/logout.tsx" },

  // Gate route
  { path: "/app", file: "./routes/app.tsx" },

  // ===== App (Authenticated layout wrapper) =====
  {
    path: "/",
    file: "./routes/__app.tsx",
    children: [
      { path: "onboarding", file: "./routes/onboarding.tsx" },
      { path: "today", file: "./routes/today.tsx" },
      { path: "dashboard", file: "./routes/dashboard.tsx" },
      { path: "progress", file: "./routes/progress.tsx" },
      { path: "checkin", file: "./routes/checkin.tsx" },

      { path: "workout/:programDayId", file: "./routes/workout.$programDayId.tsx" },

      { path: "nutrition", file: "./routes/nutrition.tsx" },
      { path: "cardio", file: "./routes/cardio.tsx" },

      { path: "group", file: "./routes/group.tsx" },
      { path: "group/join", file: "./routes/group.join.tsx" },

      // If you don't have this route yet, either create it or remove the link in AppShell
      { path: "profile", file: "./routes/profile.tsx" },
    ],
  },
];

export default routes;
