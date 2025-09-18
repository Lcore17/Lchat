import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type Theme = 'light' | 'dark' | 'system';

interface Colors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  placeholder: string;
  disabled: string;
  shadow: string;
}

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  colors: Colors;
  setTheme: (theme: Theme) => void;
}

const lightColors: Colors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#93C5FD',
  secondary: '#14B8A6',
  accent: '#F97316',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  placeholder: '#9CA3AF',
  disabled: '#D1D5DB',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

const darkColors: Colors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#93C5FD',
  secondary: '#14B8A6',
  accent: '#F97316',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#334155',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  border: '#475569',
  placeholder: '#64748B',
  disabled: '#475569',
  shadow: 'rgba(0, 0, 0, 0.3)',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'app_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemColorScheme, setSystemColorScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );

  useEffect(() => {
    loadSavedTheme();
    
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(colorScheme);
    });

    return () => subscription?.remove();
  }, []);

  const loadSavedTheme = async () => {
    try {
      const savedTheme = await SecureStore.getItemAsync(THEME_KEY);
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        setThemeState(savedTheme as Theme);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    try {
      setThemeState(newTheme);
      await SecureStore.setItemAsync(THEME_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;

  const value: ThemeContextType = {
    theme,
    isDark,
    colors,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}