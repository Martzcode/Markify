import { Injectable, computed, signal } from '@angular/core';
import { SUPPORTED_LANGS, TRANSLATIONS, type SupportedLang, type TranslationKey } from './translations';

const STORAGE_KEY = 'markify.lang';

function detectLang(): SupportedLang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (SUPPORTED_LANGS as string[]).includes(stored)) {
    return stored as SupportedLang;
  }
  const base = navigator.language?.toLowerCase().split('-')[0];
  return (SUPPORTED_LANGS as string[]).includes(base ?? '')
    ? (base as SupportedLang)
    : 'en';
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly currentLang = signal<SupportedLang>(detectLang());

  private readonly dict = computed(() => TRANSLATIONS[this.currentLang()]);

  readonly t = (key: TranslationKey, params?: Record<string, string>): string => {
    let text = this.dict()[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{{${name}}}`, value);
      }
    }
    return text;
  };

  setLang(lang: SupportedLang): void {
    this.currentLang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }
}
