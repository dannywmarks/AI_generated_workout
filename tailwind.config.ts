// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class", // 👈 class-based dark mode
  content: ["./index.html", "./app/**/*.{ts,tsx,jsx,js}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
