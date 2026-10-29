import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'markify.security';

interface StoredPreferences {
  allowRawHtml: boolean;
}

function loadAllowRawHtml(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return parsed.allowRawHtml === true;
  } catch {
    return false;
  }
}

/**
 * Préférences de rendu liées à la sécurité.
 *
 * Le HTML brut est désactivé par défaut : un document non fiable ne peut pas
 * exécuter de code. Même lorsqu'il est activé, le HTML passe par DOMPurify.
 */
@Injectable({ providedIn: 'root' })
export class SecurityService {
  readonly allowRawHtml = signal(loadAllowRawHtml());

  toggleRawHtml(): void {
    this.allowRawHtml.update((value) => !value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ allowRawHtml: this.allowRawHtml() }));
    } catch {
      // Stockage indisponible : l'option reste valable pour la session.
    }
  }
}
