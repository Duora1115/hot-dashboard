/**
 * Recharts styling helpers — theme-aware via CSS variables.
 * Values are strings the browser resolves at paint time, so they auto-adapt
 * when .light / .dark toggles on <html>.
 */

export const chartTooltipStyle = {
  backgroundColor: 'rgb(var(--vibrancy-bg) / 0.92)',
  border: '1px solid rgb(var(--hairline) / 0.14)',
  borderRadius: '10px',
  fontSize: '12px',
  padding: '8px 10px',
  boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.35)',
  backdropFilter: 'blur(16px) saturate(180%)',
  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
  color: 'hsl(var(--text-primary))',
} as const;

export const chartTooltipLabelStyle = {
  color: 'hsl(var(--text-secondary))',
  fontSize: '11px',
  marginBottom: '2px',
} as const;

export const chartAxisStroke = 'hsl(var(--text-quaternary))';
export const chartGridStroke = 'rgb(var(--hairline) / 0.08)';
