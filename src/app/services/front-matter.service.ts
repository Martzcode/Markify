import { Injectable, computed, inject, signal } from '@angular/core';
import { DocumentService } from './document.service';
import {
  applyFrontMatter,
  parseFrontMatter,
  type FrontMatter,
} from '../utils/front-matter';

/** Propriétés affichées en premier dans le panneau. */
export const KNOWN_PROPERTY_KEYS = ['title', 'date', 'tags', 'author', 'status'] as const;

export type AddPropertyResult = 'added' | 'duplicate' | 'invalid' | 'unavailable';

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

/**
 * État du panneau de propriétés YAML (F-29).
 *
 * Le document reste la source de vérité : chaque modification du panneau
 * réécrit uniquement l'en-tête via `applyFrontMatter`, passe par
 * `DocumentService.setContent` (historique, état modifié) et laisse le corps
 * du Markdown intact.
 */
@Injectable({ providedIn: 'root' })
export class FrontMatterService {
  private readonly document = inject(DocumentService);

  readonly visible = signal(false);
  readonly parsed = computed(() => parseFrontMatter(this.document.content()));
  readonly data = computed(() => this.parsed().data);

  readonly exists = computed(() => this.parsed().exists);
  readonly present = computed(() => this.parsed().present);
  readonly error = computed(() => this.parsed().error);

  readonly customKeys = computed(() =>
    Object.keys(this.data()).filter(
      (key) => !(KNOWN_PROPERTY_KEYS as readonly string[]).includes(key),
    ),
  );

  toggle(): void {
    this.visible.update((visible) => !visible);
  }

  show(): void {
    this.visible.set(true);
  }

  hide(): void {
    this.visible.set(false);
  }

  /** Crée un bloc vide pour commencer à saisir des propriétés. */
  create(): boolean {
    const parsed = this.parsed();
    if (parsed.present) {
      return true;
    }
    if (parsed.exists) {
      return false;
    }
    this.document.setContent(
      applyFrontMatter(this.document.content(), {}, { force: true }),
    );
    return true;
  }

  /** Met à jour une propriété. Une valeur vide supprime la clé. */
  setField(key: string, value: unknown): boolean {
    const parsed = this.parsed();
    if (!parsed.present) {
      return false;
    }
    const next: FrontMatter = { ...parsed.data };
    const current = next[key];
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (!(key in next)) {
        return false;
      }
      delete next[key];
    } else {
      if (sameValue(current, value)) {
        return false;
      }
      next[key] = value;
    }
    this.document.setContent(applyFrontMatter(this.document.content(), next));
    return true;
  }

  /** Ajoute une propriété personnalisée. */
  addField(key: string, value: unknown): AddPropertyResult {
    const parsed = this.parsed();
    if (!parsed.present) {
      return 'unavailable';
    }
    const name = key.trim();
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(name)) {
      return 'invalid';
    }
    if (name in parsed.data) {
      return 'duplicate';
    }
    const next: FrontMatter = { ...parsed.data, [name]: value };
    this.document.setContent(applyFrontMatter(this.document.content(), next));
    return 'added';
  }

  removeField(key: string): boolean {
    const parsed = this.parsed();
    if (!parsed.present || !(key in parsed.data)) {
      return false;
    }
    const next: FrontMatter = { ...parsed.data };
    delete next[key];
    this.document.setContent(applyFrontMatter(this.document.content(), next));
    return true;
  }
}
