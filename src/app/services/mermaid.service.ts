import { Injectable } from '@angular/core';

export type MermaidTheme = 'default' | 'dark';

type MermaidApi = (typeof import('mermaid'))['default'];

/** Au-delà, on tourne le cache : les sources tapées au clavier ne s'accumulent pas. */
const MAX_CACHE_ENTRIES = 100;

/**
 * Charge Mermaid à la demande et rend les diagrammes.
 *
 * L'import dynamique garde le moteur (et ses dépendances) hors du bundle
 * initial : il n'est téléchargé qu'au premier bloc ```mermaid rencontré.
 *
 * La configuration `strict` est essentielle : elle échappe le HTML des
 * libellés, désactive les liens cliquables et fait passer le SVG produit par
 * DOMPurify. Les directives `%%{init: …}%%` ne peuvent pas abaisser ce niveau.
 */
@Injectable({ providedIn: 'root' })
export class MermaidService {
  private modulePromise: Promise<MermaidApi> | null = null;
  private appliedTheme: MermaidTheme | null = null;
  private sequence = 0;
  private readonly cache = new Map<string, string>();

  /** Rend un diagramme et retourne le SVG assaini par Mermaid. */
  async render(source: string, theme: MermaidTheme): Promise<string> {
    const key = `${theme}\u0000${source}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const mermaid = await this.load();
    if (this.appliedTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme,
      });
      this.appliedTheme = theme;
    }

    const id = `markify-mermaid-${++this.sequence}`;
    const { svg } = await mermaid.render(id, source);
    this.remember(key, svg);
    return svg;
  }

  private load(): Promise<MermaidApi> {
    this.modulePromise ??= import('mermaid').then((module) => module.default);
    return this.modulePromise;
  }

  private remember(key: string, svg: string): void {
    this.cache.set(key, svg);
    if (this.cache.size <= MAX_CACHE_ENTRIES) {
      return;
    }
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) {
      this.cache.delete(oldest);
    }
  }
}
