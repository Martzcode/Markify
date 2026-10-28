import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { SearchService } from './search.service';
import { ToastService } from './toast.service';

describe('SearchService', () => {
  let service: SearchService;
  let documentService: DocumentService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(SearchService);
    documentService = TestBed.inject(DocumentService);
  });

  function openDocument(content: string): void {
    documentService.isOpen.set(true);
    documentService.setContent(content);
  }

  it('only opens when a document is loaded', () => {
    service.open();
    expect(service.isOpen()).toBe(false);

    documentService.isOpen.set(true);
    service.open();
    expect(service.isOpen()).toBe(true);
  });

  it('opens with the replace row when requested', () => {
    documentService.isOpen.set(true);

    service.open(true);

    expect(service.replaceVisible()).toBe(true);
    expect(service.focusTarget()).toBe('replace');
  });

  it('keeps the replace row open when Ctrl+F is pressed again', () => {
    documentService.isOpen.set(true);
    service.open(true);

    service.open(false);

    expect(service.isOpen()).toBe(true);
    expect(service.replaceVisible()).toBe(true);
    expect(service.focusTarget()).toBe('search');
  });

  it('computes the matches and the active occurrence', () => {
    openDocument('one two one');
    service.setQuery('one');

    expect(service.total()).toBe(2);
    expect(service.index()).toBe(0);
    expect(service.activeIndex()).toBe(1);
    expect(service.currentMatch()).toEqual({ start: 0, end: 3, groups: [] });
  });

  it('wraps around when navigating', () => {
    openDocument('one two one');
    service.setQuery('one');

    service.next();
    expect(service.activeIndex()).toBe(2);

    service.next();
    expect(service.activeIndex()).toBe(1);

    service.previous();
    expect(service.activeIndex()).toBe(2);
  });

  it('applies the case, whole-word and regex options', () => {
    openDocument('Cat cat concatenate');

    service.setQuery('cat');
    expect(service.total()).toBe(3);

    service.toggleCaseSensitive();
    expect(service.total()).toBe(2);

    service.toggleCaseSensitive();
    service.toggleWholeWord();
    expect(service.total()).toBe(2);

    service.toggleWholeWord();
    service.setQuery('c.t');
    service.toggleRegex();
    expect(service.total()).toBe(3);
  });

  it('reports an invalid regular expression', () => {
    openDocument('abc');
    service.setQuery('([');
    service.toggleRegex();

    expect(service.invalidRegex()).toBe(true);
    expect(service.total()).toBe(0);
    expect(service.currentMatch()).toBeNull();
  });

  it('replaces the current occurrence and moves to the next one', () => {
    openDocument('a a a');
    service.setQuery('a');
    service.setReplacement('b');

    expect(service.replaceCurrent()).toBe(1);

    expect(documentService.content()).toBe('b a a');
    expect(documentService.isDirty()).toBe(true);
    expect(service.activeIndex()).toBe(1);
    expect(service.currentMatch()?.start).toBe(2);
  });

  it('replaces every occurrence in a single content update', () => {
    openDocument('a a a');
    const setContent = vi.spyOn(documentService, 'setContent');
    const toast = vi.spyOn(TestBed.inject(ToastService), 'show');
    service.setQuery('a');
    service.setReplacement('bb');

    expect(service.replaceAll()).toBe(3);

    expect(documentService.content()).toBe('bb bb bb');
    expect(setContent).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('3 replacement(s)');
    expect(service.total()).toBe(0);
  });

  it('expands regex groups when replacing', () => {
    openDocument('John Doe');
    service.setQuery('(\\w+) (\\w+)');
    service.toggleRegex();
    service.setReplacement('$2 $1');

    expect(service.replaceCurrent()).toBe(1);
    expect(documentService.content()).toBe('Doe John');
  });

  it('does nothing when there is no occurrence', () => {
    openDocument('abc');
    service.setQuery('zzz');

    expect(service.replaceCurrent()).toBe(0);
    expect(service.replaceAll()).toBe(0);
    expect(documentService.content()).toBe('abc');
  });

  it('persists the options and restores them', () => {
    service.toggleCaseSensitive();
    service.toggleWholeWord();

    expect(JSON.parse(localStorage.getItem('markify.search')!)).toEqual({
      caseSensitive: true,
      wholeWord: true,
      regex: false,
    });

    TestBed.resetTestingModule();
    const restored = TestBed.inject(SearchService);
    expect(restored.caseSensitive()).toBe(true);
    expect(restored.wholeWord()).toBe(true);
    expect(restored.useRegex()).toBe(false);
  });

  it('closes the bar and hides the replace row', () => {
    documentService.isOpen.set(true);
    service.open(true);

    service.close();

    expect(service.isOpen()).toBe(false);
    expect(service.replaceVisible()).toBe(false);
  });
});
