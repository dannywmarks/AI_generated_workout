import { Link, useLocation } from "react-router";
import {
  Home,
  Dumbbell,
  Utensils,
  TrendingUp,
  LineChart,
} from "lucide-react";

type Item = {
  to: string;
  label: string;
  icon: React.ReactNode;
  match?: (pathname: string) => boolean;
};

export function AppNav() {
  const { pathname } = useLocation();

  const items: Item[] = [
    {
      to: "/today",
      label: "Today",
      icon: <Home className="h-5 w-5" />,
      match: (p) => p === "/today",
    },
    {
      to: "/nutrition",
      label: "Nutrition",
      icon: <Utensils className="h-5 w-5" />,
      match: (p) => p === "/nutrition",
    },
    {
      to: "/progress",
      label: "Progress",
      icon: <TrendingUp className="h-5 w-5" />,
      match: (p) => p === "/progress",
    },
    {
      to: "/dashboard",
      label: "Dashboard",
      icon: <LineChart className="h-5 w-5" />,
      match: (p) => p === "/dashboard",
    },
    {
      to: "/workout/placeholder",
      label: "Workout",
      icon: <Dumbbell className="h-5 w-5" />,
      // We don't know the active programDayId here; this is just a visual slot.
      // Your Today card is the real entry point. We'll hide this link visually.
      match: () => false,
    },
  ];

  // Hide the placeholder "Workout" button (keeps slot if you later want quick-launch)
  const visibleItems = items.filter((i) => i.to !== "/workout/placeholder");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-around px-4 py-2">
        {visibleItems.map((item) => {
          const active = item.match ? item.match(pathname) : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={[
                "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs",
                active
                  ? "text-emerald-300"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
