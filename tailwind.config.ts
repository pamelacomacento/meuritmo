import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#203A5C",
        cream: "#F6F1E8",
        paper: "#FFFCF7",
        sage: "#DDE8DA",
        coral: "#F1C7B8",
        butter: "#F3E1A4",
        line: "#DDD6CB",
        muted: "#7D8794",
      },
      boxShadow: {
        soft: "0 18px 40px rgba(32, 58, 92, 0.08)",
      },
      borderRadius: {
        xxl: "22px",
      },
    },
  },
  plugins: [],
};
export default config;
