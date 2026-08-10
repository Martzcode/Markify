import { Injectable, signal } from '@angular/core';

const DARK_QUERY = '(prefers-color-scheme: dark)';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(window.matchMedia(DARK_QUERY).matches);

  constructor() {
    this.applyTheme();
    window.matchMedia(DARK_QUERY).addEventListener('change', (event) => {
      this.isDark.set(event.matches);
      this.applyTheme();
    });
  }

  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.isDark() ? 'dark' : 'light';
  }
}
