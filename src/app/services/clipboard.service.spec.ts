import { TestBed } from '@angular/core/testing';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { vi } from 'vitest';
import { ClipboardService } from './clipboard.service';
import { DocumentService } from './document.service';
import { EditorRefService } from './editor-ref.service';
import { I18nService } from '../i18n/i18n.service';
import { ToastService } from './toast.service';

interface CapturedItem {
  data: Record<string, Blob>;
}

class ClipboardItemMock implements CapturedItem {
  constructor(readonly data: Record<string, Blob>) {}
}

describe('ClipboardService', () => {
  let service: ClipboardService;
  let doc: DocumentService;
  let editorRef: EditorRefService;
  let toast: ToastService;
  let i18n: I18nService;
  let write: ReturnType<typeof vi.fn>;
  let captured: CapturedItem[];

  beforeEach(() => {
    write = vi.fn().mockResolvedValue(undefined);
    captured = [];
    Object.defineProperty(globalThis, 'ClipboardItem', {
      value: class extends ClipboardItemMock {
        constructor(data: Record<string, Blob>) {
          super(data);
          captured.push({ data });
        }
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { write },
      configurable: true,
    });

    service = TestBed.inject(ClipboardService);
    doc = TestBed.inject(DocumentService);
    editorRef = TestBed.inject(EditorRefService);
    toast = TestBed.inject(ToastService);
    i18n = TestBed.inject(I18nService);
    vi.mocked(writeText).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    editorRef.textarea.set(null);
  });

  it('copies the Markdown source exactly', async () => {
    doc.setContent('# Hello\n\n**world**');
    doc.isOpen.set(true);

    await expect(service.copyAs('markdown')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('# Hello\n\n**world**');
    expect(toast.message()).toBe(i18n.t('toast.copiedMarkdown'));
  });

  it('copies only the textarea selection when there is one', async () => {
    doc.setContent('# Hello\n\n**world**');
    doc.isOpen.set(true);
    const textarea = globalThis.document.createElement('textarea');
    textarea.value = '# Hello\n\n**world**';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 7;
    editorRef.textarea.set(textarea);

    await service.copyAs('markdown');

    expect(writeText).toHaveBeenCalledWith('Hello');
  });

  it('copies the whole doc when the selection is empty', async () => {
    doc.setContent('# Hello');
    doc.isOpen.set(true);
    const textarea = globalThis.document.createElement('textarea');
    textarea.value = '# Hello';
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;
    editorRef.textarea.set(textarea);

    await service.copyAs('markdown');

    expect(writeText).toHaveBeenCalledWith('# Hello');
  });

  it('copies rich HTML with a plain-text fallback', async () => {
    doc.setContent('---\ntitle: Hello\n---\n# Body\n\n**world**');
    doc.isOpen.set(true);

    await expect(service.copyAs('html')).resolves.toBe(true);

    expect(write).toHaveBeenCalledTimes(1);
    const item = captured[0];
    expect(Object.keys(item.data)).toEqual(['text/html', 'text/plain']);

    const html = await item.data['text/html'].text();
    const plain = await item.data['text/plain'].text();
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>world</strong>');
    expect(html).not.toContain('title: Hello');
    expect(plain).toBe('Body\n\nworld');
    expect(toast.message()).toBe(i18n.t('toast.copiedHtml'));
  });

  it('copies plain text without markup', async () => {
    doc.setContent('---\ntitle: Hello\n---\n# Body\n\n**world**');
    doc.isOpen.set(true);

    await expect(service.copyAs('text')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('Body\n\nworld');
    expect(toast.message()).toBe(i18n.t('toast.copiedText'));
  });

  it('reports a failure when the rich clipboard rejects', async () => {
    doc.setContent('# Hello');
    doc.isOpen.set(true);
    write.mockRejectedValue(new Error('denied'));

    await expect(service.copyAs('html')).resolves.toBe(false);

    expect(toast.message()).toBe(i18n.t('toast.copyFailed'));
  });

  it('reports a failure when the plain clipboard rejects', async () => {
    doc.setContent('# Hello');
    doc.isOpen.set(true);
    vi.mocked(writeText).mockRejectedValue(new Error('denied'));

    await expect(service.copyAs('markdown')).resolves.toBe(false);

    expect(toast.message()).toBe(i18n.t('toast.copyFailed'));
  });

  it('does nothing when no doc is open', async () => {
    doc.isOpen.set(false);

    await expect(service.copyAs('markdown')).resolves.toBe(false);

    expect(writeText).not.toHaveBeenCalled();
    expect(toast.message()).toBeNull();
  });
});
