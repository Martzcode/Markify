import { TestBed } from '@angular/core/testing';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { vi } from 'vitest';
import { EditorView } from './editor-view';
import { DocumentService } from '../../services/document.service';

describe('EditorView', () => {
  function injectedStyles(): string {
    return Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
  }

  function createFixture(content: string, mode: 'read' | 'edit' | 'hybrid') {
    const service = TestBed.inject(DocumentService);
    service.setContent(content);
    service.setMode(mode);
    const fixture = TestBed.createComponent(EditorView);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorView],
    }).compileComponents();
  });

  it('renders markdown tables in read mode', () => {
    const fixture = createFixture('| a | b |\n|---|---|\n| 1 | 2 |', 'read');
    const table = fixture.nativeElement.querySelector('.editor-preview table') as HTMLTableElement;
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('th, td')).toHaveLength(4);
  });

  it('applies a border to table cells in the rendered preview', () => {
    createFixture('| a | b |\n|---|---|\n| 1 | 2 |', 'read');
    const css = injectedStyles();
    expect(css).toContain('.markdown-body th');
    expect(css).toContain('.markdown-body td');
    expect(css).toMatch(/border:\s*1px solid var\(--border\)/);
  });

  it('renders a highlighted layer under the textarea in edit mode', () => {
    const fixture = createFixture('# Title\n\n```ts\nconst x = 1;\n```', 'edit');

    const highlight = fixture.nativeElement.querySelector('.editor-highlight') as HTMLElement;
    expect(highlight).not.toBeNull();
    expect(highlight.innerHTML).toContain('syn-heading');
    expect(highlight.innerHTML).toContain('syn-code-block');

    const textarea = fixture.nativeElement.querySelector('.editor-input') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# Title\n\n```ts\nconst x = 1;\n```');

    textarea.dispatchEvent(new Event('scroll'));
    expect(highlight.scrollTop).toBe(textarea.scrollTop);
  });

  it('shows a copy button on code blocks and copies on click', async () => {
    vi.mocked(writeText).mockResolvedValue();
    const fixture = createFixture('```bash\nnpm install\n```', 'read');

    const button = fixture.nativeElement.querySelector('.code-copy') as HTMLElement;
    expect(button).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Copy');

    button.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('npm install');
    });
    expect(button.querySelector('.code-copy-label')!.textContent).toContain('Copied');
  });

  it('does not show a copy button for inline code', () => {
    const fixture = createFixture('use `marked` inline', 'read');
    expect(fixture.nativeElement.querySelector('.code-copy')).toBeNull();
  });
});
