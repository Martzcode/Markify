import { TestBed } from '@angular/core/testing';
import { EditorView } from './editor-view';
import { DocumentService } from '../../services/document.service';

describe('EditorView', () => {
  function injectedStyles(): string {
    return Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorView],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditorView);
    const service = TestBed.inject(DocumentService);
    service.setContent('| a | b |\n|---|---|\n| 1 | 2 |');
    service.setMode('read');
    fixture.detectChanges();
  });

  it('renders markdown tables in read mode', () => {
    const table = document.querySelector('.editor-preview table') as HTMLTableElement;
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('th, td')).toHaveLength(4);
  });

  it('applies a border to table cells in the rendered preview', () => {
    const css = injectedStyles();
    expect(css).toContain('.markdown-body th');
    expect(css).toContain('.markdown-body td');
    expect(css).toMatch(/border:\s*1px solid var\(--border\)/);
  });
});
