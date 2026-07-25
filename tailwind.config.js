/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        'bg-primary': '#0A0A0C',
        'bg-secondary': '#141416',
        'bg-tertiary': '#1D1D22',
        'bg-elevated': '#28282E',
        'border-subtle': '#28282E',
        'border-default': '#3A3A42',
        'border-focus': '#5A5A64',
        'text-primary': '#F4F4F7',
        'text-secondary': '#A0A0AA',
        'text-tertiary': '#71717A',
        'text-muted': '#5A5A64',
        'bull': '#30D158',
        'bear': '#FF453A',
        'neutral': '#FFD60A',
        'accent-blue': '#0A84FF',
        'accent-purple': '#BF5AF2',
        'accent-cyan': '#64D2FF',
        'heat-high': '#FF6961',
        'heat-medium': '#FF9F0A',
        'heat-low': '#30D158',
        // ---- semantic layers (theme-aware, prefer in new code) ----
        surface: {
          0: 'hsl(var(--surface-0) / <alpha-value>)',
          1: 'hsl(var(--surface-1) / <alpha-value>)',
          2: 'hsl(var(--surface-2) / <alpha-value>)',
          3: 'hsl(var(--surface-3) / <alpha-value>)',
        },
        ink: {
          primary: 'hsl(var(--text-primary) / <alpha-value>)',
          secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
          tertiary: 'hsl(var(--text-tertiary) / <alpha-value>)',
          quaternary: 'hsl(var(--text-quaternary) / <alpha-value>)',
        },
        // brand palette (auto-swaps between Apple systemColor dark/light)
        brand: {
          primary: 'rgb(var(--brand-primary) / <alpha-value>)',
          blue: 'rgb(var(--brand-blue) / <alpha-value>)',
          green: 'rgb(var(--brand-green) / <alpha-value>)',
          red: 'rgb(var(--brand-red) / <alpha-value>)',
          yellow: 'rgb(var(--brand-yellow) / <alpha-value>)',
          purple: 'rgb(var(--brand-purple) / <alpha-value>)',
          cyan: 'rgb(var(--brand-cyan) / <alpha-value>)',
          orange: 'rgb(var(--brand-orange) / <alpha-value>)',
          heat: 'rgb(var(--brand-heat) / <alpha-value>)',
        },
        // hairline / hover — black overlay in light, white in dark
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        hover: 'rgb(var(--hover-bg) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        'radius-sm': '6px',
        'radius-md': '10px',
        'radius-lg': '14px',
        'radius-xl': '20px',
        'radius-full': '9999px',
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        'card': '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.5)',
        'elevated': '0 2px 4px rgba(0,0,0,0.4), 0 24px 48px -12px rgba(0,0,0,0.5)',
        'glow-bull': '0 0 20px rgba(48,209,88,0.18)',
        'glow-bear': '0 0 20px rgba(255,69,58,0.18)',
        'inner': 'inset 0 1px 2px rgba(0,0,0,0.3)',
      },
      transitionTimingFunction: {
        // Apple-ish spring-y ease — used on route transitions and hover.
        'apple': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      fontSize: {
        // Slightly larger base for comfortable reading (Apple 15/17px baseline).
        base: ['15px', { lineHeight: '1.55' }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 5px rgba(0,227,150,0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(0,227,150,0.6)" },
        },
        "flash-border": {
          "0%, 100%": { borderColor: "rgba(239,68,68,0.2)" },
          "50%": { borderColor: "rgba(239,68,68,0.6)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "flash-border": "flash-border 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
