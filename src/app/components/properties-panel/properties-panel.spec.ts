import { TestBed } from '@angular/core/testing';
import { PropertiesPanel } from './properties-panel';
import { DocumentService } from '../../services/document.service';
import { FrontMatterService } from '../../services/front-matter.service';

describe('PropertiesPanel', () => {
  let document: DocumentService;

  function createFixture(content: string) {
    document = TestBed.inject(DocumentService);
    document.setContent(content);
    const fixture = TestBed.createComponent(PropertiesPanel);
    fixture.detectChanges();
    return fixture;
  }

  function input(fixture: ReturnType<typeof createFixture>, selector: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(selector) as HTMLInputElement;
  }

  function type(element: HTMLInputElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event('input'));
  }

  it('shows the five known properties', () => {
    const fixture = createFixture(
      '---\ntitle: Hello\ndate: 2026-11-06\ntags:\n  - one\nauthor: Ada\nstatus: Draft\n---\nBody',
    );

    expect(input(fixture, '#property-title').value).toBe('Hello');
    expect(input(fixture, '#property-date').value).toBe('2026-11-06');
    expect(input(fixture, '#property-tags').value).toBe('one');
    expect(input(fixture, '#property-author').value).toBe('Ada');
    expect(input(fixture, '#property-status').value).toBe('Draft');
  });

  it('shows a text input for a non-ISO date', () => {
    const fixture = createFixture('---\ndate: someday\n---\nBody');

    expect(input(fixture, '#property-date').type).toBe('text');
  });

  it('writes a field change back to the document', () => {
    const fixture = createFixture('---\ntitle: Old\n---\n# Body\n');

    type(input(fixture, '#property-title'), 'New');
    fixture.detectChanges();

    expect(document.content()).toContain('title: New');
    expect(document.content().endsWith('# Body\n')).toBe(true);
  });

  it('splits tags on commas and keeps the draft while typing', () => {
    const fixture = createFixture('---\ntitle: Hello\n---\nBody');

    type(input(fixture, '#property-tags'), 'one, two, ');
    fixture.detectChanges();

    expect(document.content()).toContain('- one');
    expect(document.content()).toContain('- two');
    expect(input(fixture, '#property-tags').value).toBe('one, two, ');
  });

  it('shows custom properties and removes them', () => {
    const fixture = createFixture('---\ntitle: Hello\ncategory: Notes\n---\nBody');

    const customRow = fixture.nativeElement.querySelector(
      '.property-row-custom',
    ) as HTMLElement;
    expect(customRow.textContent).toContain('category');
    expect((customRow.querySelector('input') as HTMLInputElement).value).toBe('Notes');

    (customRow.querySelector('.property-remove') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(document.content()).not.toContain('category');
  });

  it('keeps a complex custom value read-only', () => {
    const fixture = createFixture(
      '---\ntitle: Hello\noptions:\n  nested: true\n---\nBody',
    );

    const field = fixture.nativeElement.querySelector(
      '.property-row-custom input',
    ) as HTMLInputElement;
    expect(field.readOnly).toBe(true);
  });

  it('adds a property from the inline form', () => {
    const fixture = createFixture('---\ntitle: Hello\n---\nBody');

    type(input(fixture, '.property-new-key'), 'category');
    type(input(fixture, '.property-new-value'), 'Notes');
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.properties-new .properties-add') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(document.content()).toContain('category: Notes');
    expect(input(fixture, '.property-new-key').value).toBe('');
  });

  it('reports a duplicate property name', () => {
    const fixture = createFixture('---\ntitle: Hello\n---\nBody');

    type(input(fixture, '.property-new-key'), 'title');
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.properties-new .properties-add') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.properties-add-error')).not.toBeNull();
  });

  it('offers to create a header when the document has none', () => {
    const fixture = createFixture('# Body\n');

    const empty = fixture.nativeElement.querySelector('.properties-empty') as HTMLElement;
    expect(empty).not.toBeNull();

    (empty.querySelector('.properties-add') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(document.content()).toBe('---\n---\n# Body\n');
    expect(fixture.nativeElement.querySelector('.properties-fields')).not.toBeNull();
  });

  it('shows the YAML error without hiding the document', () => {
    const fixture = createFixture('---\ntitle: [broken\n---\n# Body');

    const error = fixture.nativeElement.querySelector('.properties-error') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('Invalid YAML front matter');
    expect(document.content()).toContain('# Body');
  });

  it('hides the panel from the close button', () => {
    const fixture = createFixture('---\ntitle: Hello\n---\nBody');
    const service = TestBed.inject(FrontMatterService);
    service.show();

    (
      fixture.nativeElement.querySelector('.properties-close') as HTMLButtonElement
    ).click();

    expect(service.visible()).toBe(false);
  });
});
