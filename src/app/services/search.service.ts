import { Injectable, computed, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import {
  findMatches,
  replaceAllMatches,
  replaceMatch,
  type SearchMatch,
  type SearchOptions,
} from '../utils/search';
import { DocumentService } from './document.service';
import { ToastService } from './toast.service';

const STORAGE_KEY = 'markify.search';

interface StoredOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

const DEFAULT_OPTIONS: StoredOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

function loadOptions(): StoredOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_OPTIONS;
    }
    const parsed = JSON.parse(raw) as Partial<StoredOptions>;
    return {
      caseSensitive: parsed.caseSensitive === true,
      wholeWord: parsed.wholeWord === true,
      regex: parsed.regex === true,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/**
 * État de la recherche dans le document courant : requête, options, liste des
 * occurrences et occurrence active.
 *
 * L'état vit dans un service (et non dans l'éditeur) pour rester réutilisable
 * quand une vue scindée affichera plusieurs panneaux : chaque panneau pourra
 * posséder sa propre instance d'état, les surlignages dérivant des signaux.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly document = inject(DocumentService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  private readonly initialOptions = loadOptions();

  readonly isOpen = signal(false);
  readonly replaceVisible = signal(false);
  readonly query = signal('');
  readonly replacement = signal('');
  readonly caseSensitive = signal(this.initialOptions.caseSensitive);
  readonly wholeWord = signal(this.initialOptions.wholeWord);
  readonly useRegex = signal(this.initialOptions.regex);

  /** Incrémenté à chaque déplacement : l'éditeur y réagit pour faire défiler. */
  readonly navigation = signal(0);
  /** Incrémenté quand la barre doit reprendre le focus. */
  readonly focusToken = signal(0);
  readonly focusTarget = signal<'search' | 'replace'>('search');

  private readonly rawIndex = signal(0);

  readonly options = computed<SearchOptions>(() => ({
    caseSensitive: this.caseSensitive(),
    wholeWord: this.wholeWord(),
    regex: this.useRegex(),
  }));

  readonly result = computed(() =>
    findMatches(this.document.content(), this.query(), this.options()),
  );
  readonly matches = computed<SearchMatch[]>(() => this.result().matches);
  readonly total = computed(() => this.matches().length);
  readonly invalidRegex = computed(() => this.result().invalid);

  /** Index courant, ramené dans les bornes (et à -1 sans occurrence). */
  readonly index = computed(() => {
    const total = this.total();
    if (total === 0) {
      return -1;
    }
    return ((this.rawIndex() % total) + total) % total;
  });
  readonly activeIndex = computed(() => this.index() + 1);
  readonly currentMatch = computed<SearchMatch | null>(() => this.matches()[this.index()] ?? null);

  open(replace = false): void {
    if (!this.document.isOpen()) {
      return;
    }
    if (!this.isOpen()) {
      this.replaceVisible.set(replace);
      this.rawIndex.set(0);
    } else if (replace) {
      this.replaceVisible.set(true);
    }
    this.isOpen.set(true);
    this.requestFocus(replace ? 'replace' : 'search');
    this.navigation.update((value) => value + 1);
  }

  close(): void {
    this.isOpen.set(false);
    this.replaceVisible.set(false);
  }

  toggleReplace(): void {
    const visible = !this.replaceVisible();
    this.replaceVisible.set(visible);
    this.requestFocus(visible ? 'replace' : 'search');
  }

  setQuery(query: string): void {
    this.query.set(query);
    this.rawIndex.set(0);
    this.navigation.update((value) => value + 1);
  }

  setReplacement(replacement: string): void {
    this.replacement.set(replacement);
  }

  toggleCaseSensitive(): void {
    this.caseSensitive.update((value) => !value);
    this.resetCursor();
  }

  toggleWholeWord(): void {
    this.wholeWord.update((value) => !value);
    this.resetCursor();
  }

  toggleRegex(): void {
    this.useRegex.update((value) => !value);
    this.resetCursor();
  }

  next(): void {
    if (this.total() === 0) {
      return;
    }
    this.rawIndex.set(this.index() + 1);
    this.navigation.update((value) => value + 1);
  }

  previous(): void {
    if (this.total() === 0) {
      return;
    }
    this.rawIndex.set(this.index() - 1);
    this.navigation.update((value) => value + 1);
  }

  /** Remplace l'occurrence courante puis avance. Renvoie 1 si remplacée. */
  replaceCurrent(): number {
    const match = this.currentMatch();
    if (!match) {
      return 0;
    }
    const source = this.document.content();
    const index = this.index();
    const next = replaceMatch(source, match, this.replacement(), this.options());
    if (next === source) {
      this.next();
      return 0;
    }
    this.document.setContent(next);
    // L'occurrence remplacée a disparu : celle qui la suit occupe son index.
    this.rawIndex.set(index);
    this.navigation.update((value) => value + 1);
    return 1;
  }

  /** Remplace toutes les occurrences. Renvoie le nombre de remplacements. */
  replaceAll(): number {
    const matches = this.matches();
    if (matches.length === 0) {
      return 0;
    }
    const source = this.document.content();
    const next = replaceAllMatches(source, matches, this.replacement(), this.options());
    if (next === source) {
      return 0;
    }
    this.document.setContent(next);
    this.rawIndex.set(0);
    this.navigation.update((value) => value + 1);
    this.toast.show(this.i18n.t('search.replaced', { count: String(matches.length) }));
    return matches.length;
  }

  private resetCursor(): void {
    this.rawIndex.set(0);
    this.persistOptions();
    this.navigation.update((value) => value + 1);
  }

  private requestFocus(target: 'search' | 'replace'): void {
    this.focusTarget.set(target);
    this.focusToken.update((value) => value + 1);
  }

  private persistOptions(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          caseSensitive: this.caseSensitive(),
          wholeWord: this.wholeWord(),
          regex: this.useRegex(),
        }),
      );
    } catch {
      // Stockage indisponible : les options restent valables pour la session.
    }
  }
}
