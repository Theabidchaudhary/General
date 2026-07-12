import { useEffect } from 'react';
import type { UserSettings } from '@/types/models';

/**
 * Applies the effective theme to <html data-theme>, which styles.css's
 * custom `dark:` variant reads instead of the OS media query directly — so
 * an explicit "light"/"dark" choice can override the system preference.
 * "system" still tracks the OS live via a matchMedia listener.
 */
export function useTheme(theme: UserSettings['theme']): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function apply(): void {
      const effective = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = effective;
    }

    apply();

    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
