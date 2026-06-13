module.exports = {
  content: ["./frontend/**/*.{html,js}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [{
      dark: {
        "primary": "#60a5fa",
        "secondary": "#a855f7",
        "accent": "#fbbf24",
        "neutral": "#1e293b",
        "base-100": "#0f172a",
        "base-200": "#1e293b",
        "base-300": "#334155",
        "info": "#60a5fa",
        "success": "#22c55e",
        "warning": "#eab308",
        "error": "#ef4444",
      }
    }]
  }
}
