/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep space navy palette
        obsidian: {
          950: "#030712",
          900: "#0a0f1a",
          850: "#0d1321",
          800: "#111827",
          700: "#1e293b",
          600: "#334155"
        },
        // Neon accent colors
        neon: {
          cyan: "#22d3ee",
          emerald: "#34d399",
          rose: "#fb7185",
          amber: "#fbbf24",
          violet: "#a78bfa"
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"]
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
        "scan-line": "scan-line 8s linear infinite",
        "data-stream": "data-stream 20s linear infinite"
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px currentColor, 0 0 10px currentColor" },
          "100%": { boxShadow: "0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        },
        "data-stream": {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "100% 100%" }
        }
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(rgba(34, 211, 238, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.03) 1px, transparent 1px)",
        "gradient-radial": "radial-gradient(ellipse at center, var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))"
      },
      backgroundSize: {
        "grid": "50px 50px"
      },
      boxShadow: {
        "glow-sm": "0 0 10px -3px currentColor",
        "glow": "0 0 20px -5px currentColor",
        "glow-lg": "0 0 40px -10px currentColor",
        "inner-glow": "inset 0 0 20px -5px currentColor"
      }
    }
  },
  plugins: []
};
