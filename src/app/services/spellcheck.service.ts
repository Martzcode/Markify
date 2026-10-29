import { Injectable, computed, signal } from '@angular/core';
import { SUPPORTED_LANGS, type SupportedLang } from '../i18n/translations';

const STORAGE_KEY = 'markify.spellcheck';

export type SpellcheckLanguage = 'auto' | SupportedLang;

/** Langues proposées : automatique (système) puis les langues de l'interface. */
export const SPELLCHECK_LANGUAGES: readonly SpellcheckLanguage[] = ['auto', ...SUPPORTED_LANGS];

interface StoredPreferences {
  enabled: boolean;
  language: SpellcheckLanguage;
}

const DEFAULT_PREFERENCES: StoredPreferences = { enabled: true, language: 'auto' };

function isLanguage(value: unknown): value is SpellcheckLanguage {
  return typeof value === 'string' && (SPELLCHECK_LANGUAGES as readonly string[]).includes(value);
}

function loadPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFERENCES.enabled,
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_PREFERENCES.language,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Préférences du correcteur orthographique natif de la WebView.
 *
 * Le correcteur est activé par défaut et utilise la langue du système. Une
 * langue explicite est transmise au textarea via l'attribut `lang`, sans
 * toucher au surlignage syntaxique qui reste affiché dans la couche arrière.
 */
@Injectable({ providedIn: 'root' })
export class SpellcheckService {
  private readonly initial = loadPreferences();

  readonly enabled = signal(this.initial.enabled);
  readonly language = signal<SpellcheckLanguage>(this.initial.language);

  /** Valeur de l'attribut `lang` ; `null` laisse la WebView suivre le système. */
  readonly langAttribute = computed(() => (this.language() === 'auto' ? null : this.language()));

  toggle(): void {
    this.enabled.update((value) => !value);
    this.persist();
  }

  setLanguage(language: SpellcheckLanguage): void {
    this.language.set(language);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled: this.enabled(), language: this.language() }),
      );
    } catch {
      // Stockage indisponible : le choix reste valable pour la session.
    }
  }
}
