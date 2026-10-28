import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'markify.code-blocks';

interface StoredPreferences {
  lineNumbers: boolean;
}

function loadLineNumbers(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return parsed.lineNumbers === true;
  } catch {
    return false;
  }
}

/**
 * Préférences d'affichage des blocs de code. Les numéros de ligne sont une
 * option globale, désactivée par défaut, appliquée à l'aperçu.
 */
@Injectable({ providedIn: 'root' })
export class CodeBlockService {
  readonly lineNumbers = signal(loadLineNumbers());

  toggleLineNumbers(): void {
    this.lineNumbers.update((value) => !value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lineNumbers: this.lineNumbers() }));
    } catch {
      // Stockage indisponible : l'option reste valable pour la session.
    }
  }
}
