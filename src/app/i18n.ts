import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type LangCode = 'fr' | 'en' | 'es' | 'de';

const dicts: Record<LangCode, Record<string, string>> = {
  fr: {
    empty_state: 'Ouvrez un fichier Markdown pour le prévisualiser',
    convert_pdf: 'Convertir en PDF',
    error_prefix: 'Erreur',
    conversion_error: 'Erreur lors de la conversion',
  },
  en: {
    empty_state: 'Open a Markdown file to preview it',
    convert_pdf: 'Convert to PDF',
    error_prefix: 'Error',
    conversion_error: 'Error during conversion',
  },
  es: {
    empty_state: 'Abra un archivo Markdown para previsualizarlo',
    convert_pdf: 'Convertir a PDF',
    error_prefix: 'Error',
    conversion_error: 'Error durante la conversión',
  },
  de: {
    empty_state: 'Öffnen Sie eine Markdown-Datei, um sie anzuzeigen',
    convert_pdf: 'In PDF konvertieren',
    error_prefix: 'Fehler',
    conversion_error: 'Fehler bei der Konvertierung',
  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<LangCode>('en');

  t(key: string): string {
    return dicts[this.lang()][key] ?? key;
  }

  async init(): Promise<void> {
    const log = async (msg: string): Promise<void> => {
      console.log(msg);
      await invoke('log_front', { msg }).catch(() => undefined);
    };

    void listen<LangCode>('language-changed', (event) => {
      void log('[i18n] language-changed received: ' + String(event.payload));
      if (this.isLangCode(event.payload)) {
        this.lang.set(event.payload);
        void log('[i18n] lang set to: ' + event.payload);
      } else {
        void log('[i18n] unknown payload: ' + String(event.payload));
      }
    }).catch((e) => console.error('[i18n] listen failed:', e));

    const code = await invoke<string>('get_language');
    void log('[i18n] get_language returned: ' + code);
    if (this.isLangCode(code)) {
      this.lang.set(code);
      void log('[i18n] lang set to: ' + code);
    }
  }

  private isLangCode(value: string): value is LangCode {
    return value === 'fr' || value === 'en' || value === 'es' || value === 'de';
  }
}
