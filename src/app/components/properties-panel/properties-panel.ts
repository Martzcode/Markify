import { Component, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import type { TranslationKey } from '../../i18n/translations';
import {
  FrontMatterService,
  KNOWN_PROPERTY_KEYS,
  type AddPropertyResult,
} from '../../services/front-matter.service';

interface KnownField {
  key: (typeof KNOWN_PROPERTY_KEYS)[number];
  labelKey: TranslationKey;
}

interface CustomField {
  key: string;
  value: string;
  editable: boolean;
}

const KNOWN_FIELDS: readonly KnownField[] = [
  { key: 'title', labelKey: 'properties.field.title' },
  { key: 'date', labelKey: 'properties.field.date' },
  { key: 'tags', labelKey: 'properties.field.tags' },
  { key: 'author', labelKey: 'properties.field.author' },
  { key: 'status', labelKey: 'properties.field.status' },
];

/**
 * Panneau d'édition des propriétés YAML (F-29).
 *
 * Les cinq propriétés courantes ont une ligne dédiée ; les autres clés du
 * mapping sont affichées dans une section « Autres propriétés ». Les valeurs
 * complexes (objets, listes) restent en lecture seule pour ne pas changer leur
 * type par accident.
 */
@Component({
  selector: 'app-properties-panel',
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.css',
})
export class PropertiesPanel {
  protected readonly i18n = inject(I18nService);
  protected readonly frontMatter = inject(FrontMatterService);
  protected readonly knownFields = KNOWN_FIELDS;

  protected readonly newKey = signal('');
  protected readonly newValue = signal('');
  protected readonly addError = signal<string | null>(null);
  private readonly tagsDraft = signal<string | null>(null);

  protected readonly dateInputType = computed<'date' | 'text'>(() => {
    const value = this.frontMatter.data()['date'];
    if (value === undefined || value === null || value === '') {
      return 'date';
    }
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'date' : 'text';
  });

  protected readonly tagsValue = computed(() => {
    const draft = this.tagsDraft();
    return draft ?? this.displayValue(this.frontMatter.data()['tags']);
  });

  protected readonly customFields = computed<CustomField[]>(() =>
    this.frontMatter.customKeys().map((key) => {
      const value = this.frontMatter.data()[key];
      return {
        key,
        value: this.displayValue(value),
        editable: this.isScalar(value),
      };
    }),
  );

  protected knownValue(key: string): string {
    return this.displayValue(this.frontMatter.data()[key]);
  }

  private displayValue(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.displayValue(entry)).join(', ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private isScalar(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  }

  protected onFieldInput(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.frontMatter.setField(key, value === '' ? null : value);
  }

  protected onTagsInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.tagsDraft.set(text);
    const tags = text
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    this.frontMatter.setField('tags', tags.length > 0 ? tags : null);
  }

  protected onTagsBlur(): void {
    this.tagsDraft.set(null);
  }

  protected onCustomInput(key: string, event: Event): void {
    this.frontMatter.setField(key, (event.target as HTMLInputElement).value);
  }

  protected create(): void {
    this.frontMatter.create();
  }

  protected remove(key: string): void {
    this.frontMatter.removeField(key);
  }

  protected onNewKeyInput(event: Event): void {
    this.newKey.set((event.target as HTMLInputElement).value);
    this.addError.set(null);
  }

  protected onNewValueInput(event: Event): void {
    this.newValue.set((event.target as HTMLInputElement).value);
  }

  protected addProperty(): void {
    if (this.newKey().trim() === '') {
      return;
    }
    const result: AddPropertyResult = this.frontMatter.addField(
      this.newKey(),
      this.newValue(),
    );
    if (result === 'added') {
      this.newKey.set('');
      this.newValue.set('');
      this.addError.set(null);
      return;
    }
    this.addError.set(
      this.i18n.t(
        result === 'duplicate' ? 'properties.duplicate' : 'properties.invalidKey',
      ),
    );
  }

  protected close(): void {
    this.frontMatter.hide();
  }
}
