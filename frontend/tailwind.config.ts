import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#070707",
          900: "#0d0d0f",
          850: "#121216",
          800: "#19191f",
          700: "#25252d"
        },
        gold: {
          500: "#d8b45d",
          400: "#e8c875"
        },
        silver: {
          500: "#b9c0c9",
          400: "#d6dbe2"
        }
      },
      boxShadow: {
        "gold-soft":
          "0 0 0 1px rgba(216, 180, 93, 0.18), 0 24px 80px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};

export default config;
