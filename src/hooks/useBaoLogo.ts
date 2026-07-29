import { useAppContext } from '@/hooks/useAppContext';
import { resolveTheme } from '@/themes';

/**
 * Theme-aware ₿AO wordmark. `/bao-logo-word.png` is the light artwork for
 * dark backgrounds; `/bao-logo-word-dark.png` is the darkened variant for
 * light backgrounds.
 *
 * This must resolve the theme in React — NOT via Tailwind `dark:` classes:
 * the app theme is the `light`/`dark`/`custom` class on <html> set by
 * AppProvider, while `dark:` utilities follow the OS media query (Tailwind
 * has no `darkMode: 'class'` here), so they can disagree with the app theme.
 * "custom" presets (e.g. Hacker, black background) get the light artwork.
 */
export function useBaoLogo(): string {
  const { config } = useAppContext();
  return resolveTheme(config.theme) === 'light' ? '/bao-logo-word-dark.png' : '/bao-logo-word.png';
}
