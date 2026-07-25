import { useEffect, useState } from 'react';

/**
 * Auto-switch theme based on Beijing time.
 * Light 07:00–18:59, dark otherwise.
 *
 * The initial class is applied by an inline script in index.html to prevent
 * FOUC — this hook keeps it in sync while the tab is open.
 *
 * Re-checks on:
 *   - a 1-minute interval (cheap; only reads Date)
 *   - visibility change (catches tabs left open across the boundary)
 */

export type Theme = 'light' | 'dark';

function computeBeijingTheme(): Theme {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10,
    );
    return h >= 7 && h < 19 ? 'light' : 'dark';
  } catch {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
}

export function useAutoTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => computeBeijingTheme());

  useEffect(() => {
    // Sync — inline script may have already applied, but keep state in agreement.
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const tick = () => {
      const next = computeBeijingTheme();
      setTheme((prev) => (prev === next ? prev : next));
    };

    tick();
    const interval = window.setInterval(tick, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return theme;
}
