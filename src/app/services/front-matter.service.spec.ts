import { TestBed } from '@angular/core/testing';
import { FrontMatterService } from './front-matter.service';
import { DocumentService } from './document.service';

describe('FrontMatterService', () => {
  let document: DocumentService;
  let service: FrontMatterService;

  beforeEach(() => {
    document = TestBed.inject(DocumentService);
    service = TestBed.inject(FrontMatterService);
  });

  it('creates a header on demand and exposes the parsed fields', () => {
    document.setContent('# Body\n');

    expect(service.present()).toBe(false);
    expect(service.create()).toBe(true);
    expect(document.content()).toBe('---\n---\n# Body\n');
    expect(service.present()).toBe(true);
    expect(service.data()).toEqual({});
  });

  it('does not create a header when the existing one is invalid', () => {
    document.setContent('---\ntitle: [broken\n---\n# Body');

    expect(service.error()).toBeTruthy();
    expect(service.create()).toBe(false);
    expect(document.content()).toContain('[broken');
  });

  it('updates a field without changing the body', () => {
    document.setContent('---\ntitle: Old\n---\n# Body\n\nText.\n');

    expect(service.setField('title', 'New')).toBe(true);
    expect(document.content()).toContain('title: New');
    expect(document.content().endsWith('# Body\n\nText.\n')).toBe(true);
  });

  it('stores tags as an array', () => {
    document.setContent('---\ntitle: Hello\n---\nBody');

    expect(service.setField('tags', ['one', 'two'])).toBe(true);
    expect(service.data()['tags']).toEqual(['one', 'two']);
    expect(document.content()).toContain('- one');
  });

  it('ignores an unchanged value', () => {
    document.setContent('---\ntitle: Hello\n---\nBody');

    expect(service.setField('title', 'Hello')).toBe(false);
    expect(document.content()).toBe('---\ntitle: Hello\n---\nBody');
  });

  it('removes a field when the value is empty', () => {
    document.setContent('---\ntitle: Hello\nauthor: Ada\n---\nBody');

    expect(service.setField('title', '')).toBe(true);
    expect(service.data()).toEqual({ author: 'Ada' });
    expect(document.content()).toBe('---\nauthor: Ada\n---\nBody');
  });

  it('refuses mutations when there is no valid header', () => {
    document.setContent('# Body');

    expect(service.setField('title', 'Hello')).toBe(false);
    expect(service.addField('title', 'Hello')).toBe('unavailable');
    expect(service.removeField('title')).toBe(false);
    expect(document.content()).toBe('# Body');
  });

  it('adds a custom property', () => {
    document.setContent('---\ntitle: Hello\n---\nBody');

    expect(service.addField('category', 'Notes')).toBe('added');
    expect(service.data()['category']).toBe('Notes');
    expect(service.customKeys()).toEqual(['category']);
  });

  it('accepts accented custom property names', () => {
    document.setContent('---\ntitle: Hello\n---\nBody');

    expect(service.addField('catégorie', 'Notes')).toBe('added');
    expect(service.data()['catégorie']).toBe('Notes');
  });

  it('rejects duplicate and invalid property names', () => {
    document.setContent('---\ntitle: Hello\n---\nBody');

    expect(service.addField('title', 'Other')).toBe('duplicate');
    expect(service.addField('bad:name', 'value')).toBe('invalid');
    expect(service.addField('   ', 'value')).toBe('invalid');
  });

  it('removes a custom property', () => {
    document.setContent('---\ntitle: Hello\ncategory: Notes\n---\nBody');

    expect(service.removeField('category')).toBe(true);
    expect(service.data()).toEqual({ title: 'Hello' });
    expect(document.content()).not.toContain('category');
  });

  it('toggles and hides the panel', () => {
    expect(service.visible()).toBe(false);
    service.toggle();
    expect(service.visible()).toBe(true);
    service.hide();
    expect(service.visible()).toBe(false);
    service.show();
    expect(service.visible()).toBe(true);
  });

  it('keeps custom keys in document order', () => {
    document.setContent('---\nzeta: 1\nalpha: 2\ntitle: Hello\n---\nBody');

    expect(service.customKeys()).toEqual(['zeta', 'alpha']);
  });
});
