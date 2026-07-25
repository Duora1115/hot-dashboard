import { useEffect, useState, useCallback } from 'react';

/**
 * Theme manager with three modes:
 *   - 'auto':  Light 07:00–18:59 Beijing time, dark otherwise.
 *   - 'light': Force light mode.
 *   - 'dark':  Force dark mode.
 *
 * The mode is persisted to localStorage so it survives reloads.
 * The initial class is applied by an inline script in index.html to prevent
 * FOUC — this hook keeps it in sync while the tab is open.
 */

export type Theme = 'light' | 'dark';
export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';

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

function resolveTheme(mode: ThemeMode): Theme {
  if (mode === 'auto') return computeBeijingTheme();
  return mode;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
}

function loadMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {}
  return 'auto';
}

function saveMode(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function useAutoTheme(): { theme: Theme; mode: ThemeMode; setMode: (m: ThemeMode) => void; toggle: () => void } {
  const [mode, setModeState] = useState<ThemeMode>(loadMode);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(loadMode()));

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    saveMode(m);
    const next = resolveTheme(m);
    setTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      // Toggle between light and dark, ignoring auto mode
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      saveMode(next);
      setTheme(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Re-evaluate when in auto mode
  useEffect(() => {
    if (mode !== 'auto') return;
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
  }, [mode]);

  return { theme, mode, setMode, toggle };
}
