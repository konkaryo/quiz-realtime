// tailwind.config.js
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        brand: ['"Acumin Pro Extra Condensed Bold Italic"'],
        brutal: ['"Brutal Type Black"']
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },

      /* utilitaires pour l'anti-banding */
      backgroundImage: {
        "noise-grain":
          "radial-gradient(circle at center, rgba(255,255,255,0.18) 0.5px, transparent 0.5px)",
      },
      backgroundSize: {
        "noise-size": "4px 4px",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // utilitaire bg-campaign = dégradé radial violet
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".bg-campaign":
          "background: radial-gradient(200px circle at 50% 50%, #465811 0%, #3a0941 10%, #23052a 48%, #14051f 66%, #0b0416 100%)",
      });
    }),
  ],
};
