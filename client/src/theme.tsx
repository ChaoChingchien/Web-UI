import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  accentColor: string;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  accentColor: 'indigo',
  setTheme: () => {},
  setAccentColor: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [accentColor, setAccentColorState] = useState('indigo');

  useEffect(() => {
    window.api.settings.get().then((settings) => {
      setThemeState(settings.theme);
      resolveTheme(settings.theme);
      if (settings.accentColor) setAccentColorState(settings.accentColor);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        setResolvedTheme(mq.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  function resolveTheme(t: Theme) {
    if (t === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(prefersDark ? 'dark' : 'light');
    } else {
      setResolvedTheme(t);
    }
  }

  function setTheme(t: Theme) {
    setThemeState(t);
    resolveTheme(t);
    window.api.settings.set({ theme: t } as any);
  }

  function setAccentColor(color: string) {
    setAccentColorState(color);
    window.api.settings.set({ accentColor: color } as any);
  }

  useEffect(() => {
    document.documentElement.className = `theme-${resolvedTheme}`;
    document.documentElement.setAttribute('data-accent', accentColor);
  }, [resolvedTheme, accentColor]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, accentColor, setTheme, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
