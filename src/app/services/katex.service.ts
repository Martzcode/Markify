import { Injectable } from '@angular/core';

type KatexApi = (typeof import('katex'))['default'];

/** Au-delà, on tourne le cache : les formules tapées au clavier ne s'accumulent pas. */
const MAX_CACHE_ENTRIES = 200;

/**
 * Charge KaTeX à la demande et rend les formules.
 *
 * L'import dynamique garde le moteur (environ 255 Ko) hors du bundle initial :
 * il n'est téléchargé qu'à la première formule rencontrée. KaTeX est déjà une
 * dépendance transitive de Mermaid ; ce service réutilise donc le même chunk.
 *
 * `trust: false` interdit `\href`, `\url`, `\htmlStyle`, etc. et empêche une
 * formule d'injecter du HTML ou une URL dans l'aperçu. `throwOnError` laisse
 * l'appelant afficher la source TeX plutôt qu'un message rouge dans le DOM.
 */
@Injectable({ providedIn: 'root' })
export class KatexService {
  private modulePromise: Promise<KatexApi> | null = null;
  private readonly cache = new Map<string, string>();

  /** Rend une formule et retourne le HTML produit par KaTeX. */
  async render(source: string, displayMode: boolean): Promise<string> {
    const key = `${displayMode ? 'block' : 'inline'}\u0000${source}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const katex = await this.load();
    const html = katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
      maxExpand: 1000,
      maxSize: 500,
    });
    this.remember(key, html);
    return html;
  }

  private load(): Promise<KatexApi> {
    this.modulePromise ??= import('katex').then((module) => module.default);
    return this.modulePromise;
  }

  private remember(key: string, html: string): void {
    this.cache.set(key, html);
    if (this.cache.size <= MAX_CACHE_ENTRIES) {
      return;
    }
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) {
      this.cache.delete(oldest);
    }
  }
}
