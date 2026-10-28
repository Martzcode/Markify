import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentService } from '../../services/document.service';
import { SearchService } from '../../services/search.service';
import { SearchBar } from './search-bar';

describe('SearchBar', () => {
  let fixture: ComponentFixture<SearchBar>;
  let search: SearchService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [SearchBar] }).compileComponents();
    const documentService = TestBed.inject(DocumentService);
    documentService.isOpen.set(true);
    documentService.setContent('one two one');
    search = TestBed.inject(SearchService);
    search.setQuery('one');
    search.open();
    fixture = TestBed.createComponent(SearchBar);
    fixture.detectChanges();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function searchInput(): HTMLInputElement {
    return element().querySelector<HTMLInputElement>('.search-input')!;
  }

  it('shows the occurrence counter', () => {
    expect(element().textContent).toContain('1 / 2');

    search.next();
    fixture.detectChanges();

    expect(element().textContent).toContain('2 / 2');
  });

  it('updates the query as the user types', () => {
    const input = searchInput();
    input.value = 'two';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(search.query()).toBe('two');
    expect(element().textContent).toContain('1 / 1');
  });

  it('navigates with Enter and Shift+Enter', () => {
    const input = searchInput();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(search.activeIndex()).toBe(2);

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );
    expect(search.activeIndex()).toBe(1);
  });

  it('closes on Escape', () => {
    searchInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(search.isOpen()).toBe(false);
  });

  it('reveals the replace row and replaces every occurrence', () => {
    const toggle = element().querySelectorAll<HTMLButtonElement>('.search-icon-button')[5];
    toggle.click();
    fixture.detectChanges();

    expect(element().querySelector('.replace-row')).not.toBeNull();

    const inputs = element().querySelectorAll<HTMLInputElement>('.search-input');
    const replacement = inputs[1];
    replacement.value = '1';
    replacement.dispatchEvent(new Event('input'));

    const replaceAll = element().querySelectorAll<HTMLButtonElement>('.search-text-button')[1];
    replaceAll.click();
    fixture.detectChanges();

    expect(TestBed.inject(DocumentService).content()).toBe('1 two 1');
    expect(element().textContent).toContain('No results');
  });

  it('shows an error for an invalid regular expression', () => {
    search.toggleRegex();
    search.setQuery('([');
    fixture.detectChanges();

    expect(element().querySelector('.search-error')?.textContent).toContain(
      'Invalid regular expression',
    );
  });
});
