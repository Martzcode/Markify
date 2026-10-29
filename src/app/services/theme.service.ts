import { Injectable, signal } from '@angular/core';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const STORAGE_KEY = 'markify.theme';

export type ThemePreference = 'light' | 'dark' | 'auto';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto';
}

function loadPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Gère le thème clair/sombre.
 *
 * Trois préférences sont proposées : `light`, `dark` et `auto`. En mode
 * `auto`, le thème suit la préférence du système en temps réel ; en mode
 * manuel, les changements du système sont ignorés. Le choix est mémorisé.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media: MediaQueryList | null =
    typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;

  readonly preference = signal<ThemePreference>(loadPreference());
  readonly isDark = signal(this.resolveDark(this.preference(), this.media?.matches === true));

  constructor() {
    this.applyTheme();
    this.media?.addEventListener('change', (event) => {
      if (this.preference() === 'auto') {
        this.isDark.set(event.matches);
        this.applyTheme();
      }
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.isDark.set(this.resolveDark(preference, this.media?.matches === true));
    this.applyTheme();
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Stockage indisponible : le choix reste valable pour la session.
    }
  }

  private resolveDark(preference: ThemePreference, systemDark: boolean): boolean {
    return preference === 'auto' ? systemDark : preference === 'dark';
  }

  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.isDark() ? 'dark' : 'light';
  }
}
