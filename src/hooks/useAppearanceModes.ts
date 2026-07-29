import { Moon, Sun, Terminal, type LucideIcon } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { themePresets } from '@/themes';

export type AppearanceModeId = 'bright' | 'dark' | 'hacker';

export interface AppearanceMode {
  id: AppearanceModeId;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}

/**
 * The three appearance modes (Bright / Dark / Hacker) with active state and
 * select handlers — shared by the settings cards (AppearanceSettings) and the
 * quick switch in the sidebar/top bar (ThemeQuickSwitch). Bright and Dark are
 * the builtin themes; Hacker applies the `hacker` preset as a custom theme.
 */
export function useAppearanceModes(): AppearanceMode[] {
  const { theme, customTheme, setTheme, applyCustomTheme } = useTheme();
  const hacker = themePresets.hacker;

  return [
    {
      id: 'bright',
      label: 'Bright',
      icon: Sun,
      active: theme === 'light',
      onSelect: () => setTheme('light'),
    },
    {
      id: 'dark',
      label: 'Dark',
      icon: Moon,
      active: theme === 'dark',
      onSelect: () => setTheme('dark'),
    },
    {
      id: 'hacker',
      label: 'Hacker',
      icon: Terminal,
      active: theme === 'custom' && customTheme?.title === hacker.label,
      onSelect: () =>
        applyCustomTheme({
          title: hacker.label,
          colors: hacker.colors,
          font: hacker.font,
          radius: hacker.radius,
        }),
    },
  ];
}
