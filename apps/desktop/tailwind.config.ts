import type { Config } from "tailwindcss";

// Design tokens live as CSS variables in index.css; Tailwind maps to them so every
// component shares one palette. Change the theme in one place, the whole app follows.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        surface: "hsl(var(--surface))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        fg: "hsl(var(--fg))",
        primary: "hsl(var(--primary))",
        "primary-fg": "hsl(var(--primary-fg))",
      },
      borderRadius: {
        lg: "0.6rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
