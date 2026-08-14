import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open, save } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { EditorRefService } from './editor-ref.service';
import { ToastService } from './toast.service';

describe('DocumentService', () => {
  let service: DocumentService;
  let toast: ToastService;
  let editorRef: EditorRefService;

  beforeEach(() => {
    service = TestBed.inject(DocumentService);
    toast = TestBed.inject(ToastService);
    editorRef = TestBed.inject(EditorRefService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('opens a markdown file and switches to read mode', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/test.md');
    vi.mocked(invoke).mockResolvedValue('# Hello');

    await service.openFile();

    expect(invoke).toHaveBeenCalledWith('read_markdown_file', {
      path: '/tmp/test.md',
    });
    expect(service.filePath()).toBe('/tmp/test.md');
    expect(service.content()).toBe('# Hello');
    expect(service.isOpen()).toBe(true);
    expect(service.mode()).toBe('read');
    expect(service.isDirty()).toBe(false);
  });

  it('does nothing when the open dialog is cancelled', async () => {
    vi.mocked(open).mockImplementation(() => Promise.resolve(null));

    await service.openFile();

    expect(invoke).not.toHaveBeenCalled();
    expect(service.filePath()).toBeNull();
    expect(service.isOpen()).toBe(false);
  });

  it('accepts mdx files in the open dialog', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/doc.mdx');
    vi.mocked(invoke).mockResolvedValue('import { Chart } from "./chart";');

    await service.openFile();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: 'Markdown / MDX', extensions: ['md', 'markdown', 'mdx'] }],
      }),
    );
    expect(service.filePath()).toBe('/tmp/doc.mdx');
    expect(service.mode()).toBe('read');
  });

  it('reports an error when the file cannot be read', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/missing.md');
    vi.mocked(invoke).mockRejectedValue(new Error('file not found'));

    await service.openFile();

    expect(service.error()).toContain('file not found');
    expect(service.filePath()).toBeNull();
  });

  it('creates a new file in edit mode', () => {
    service.setContent('old');
    service.filePath.set('/tmp/old.md');
    service.isOpen.set(true);
    service.setMode('read');
    service.isDirty.set(true);

    service.newFile();

    expect(service.content()).toBe('');
    expect(service.filePath()).toBeNull();
    expect(service.isOpen()).toBe(true);
    expect(service.mode()).toBe('edit');
    expect(service.isDirty()).toBe(false);
  });

  it('saves an existing file to its path without a dialog', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.filePath.set('/tmp/test.md');
    service.setContent('# Hello');

    await service.saveFile();

    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/test.md',
      content: '# Hello',
    });
    expect(save).not.toHaveBeenCalled();
    expect(service.filePath()).toBe('/tmp/test.md');
    expect(service.isDirty()).toBe(false);
  });

  it('asks for a path when saving a new file', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/new.md');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.setContent('# New');

    await service.saveFile();

    expect(save).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/new.md',
      content: '# New',
    });
    expect(service.filePath()).toBe('/tmp/new.md');
    expect(service.isDirty()).toBe(false);
  });

  it('does nothing when the save dialog is cancelled', async () => {
    vi.mocked(save).mockImplementation(() => Promise.resolve(null));
    service.setContent('# New');

    await service.saveFile();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('exports the content as a pdf file', async () => {
    let pdfContent: Uint8Array | undefined;
    vi.mocked(save).mockResolvedValue('/tmp/out.pdf');
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'write_pdf_file') {
        pdfContent = (args as { content?: unknown } | undefined)?.content as Uint8Array | undefined;
      }
      return undefined;
    });
    service.isOpen.set(true);
    service.setContent('# Hello\n\nSome *text* here.');

    await service.exportPdf();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'untitled.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      'write_pdf_file',
      expect.objectContaining({ path: '/tmp/out.pdf' }),
    );
    expect(pdfContent).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(pdfContent!.slice(0, 4))).toBe('%PDF');
    expect(toast.message()).toBe('PDF exported');
  });

  it('uses the document filename as the default export name', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/guide.pdf');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.isOpen.set(true);
    service.filePath.set('/some/dir/my-doc.md');
    service.setContent('body');

    await service.exportPdf();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'my-doc.pdf' }));
  });

  it('exports a document with a data-url image', async () => {
    let pdfContent: Uint8Array | undefined;
    const png =
      'data:image/png;base64,' +
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    vi.mocked(save).mockResolvedValue('/tmp/with-image.pdf');
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'write_pdf_file') {
        pdfContent = (args as { content?: unknown } | undefined)?.content as Uint8Array | undefined;
      }
      return undefined;
    });
    service.isOpen.set(true);
    service.setContent(`# Hello\n\n![logo](${png})`);

    await service.exportPdf();

    expect(pdfContent).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(pdfContent!.slice(0, 4))).toBe('%PDF');
    expect(service.error()).toBeNull();
  });

  it('skips an image that cannot be fetched and warns the user', async () => {
    let pdfContent: Uint8Array | undefined;
    vi.mocked(save).mockResolvedValue('/tmp/skipped.pdf');
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'write_pdf_file') {
        pdfContent = (args as { content?: unknown } | undefined)?.content as Uint8Array | undefined;
      }
      return undefined;
    });
    service.isOpen.set(true);
    service.setContent(
      '# Hello\n\n![broken](https://example.org/broken.png)\n\n![ok](https://example.org/ok.png)',
    );

    await service.exportPdf();

    expect(pdfContent).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(pdfContent!.slice(0, 4))).toBe('%PDF');
    expect(service.error()).toBeNull();
    expect(toast.message()).toBe('PDF exported, 2 image(s) missing');
  });

  it('does nothing when exporting without an open document', async () => {
    await service.exportPdf();

    expect(save).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does nothing when the export dialog is cancelled', async () => {
    vi.mocked(save).mockImplementation(() => Promise.resolve(null));
    service.isOpen.set(true);
    service.setContent('# Hello');

    await service.exportPdf();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports an error when the pdf cannot be written', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/out.pdf');
    vi.mocked(invoke).mockRejectedValue(new Error('disk full'));
    service.isOpen.set(true);
    service.setContent('# Hello');

    await service.exportPdf();

    expect(service.error()).toContain('disk full');
    expect(toast.message()).toBeNull();
  });

  it('shows a toast when an existing file is saved', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.filePath.set('/tmp/test.md');
    service.setContent('# Hello');

    await service.saveFile();

    expect(toast.message()).toBe('Changes saved');
  });

  it('does not show a toast when saving a brand new file', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/new.md');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.setContent('# New');

    await service.saveFile();

    expect(toast.message()).toBeNull();
  });

  it('cycles through the editor modes', () => {
    service.setMode('edit');
    expect(service.mode()).toBe('edit');

    service.toggleMode();
    expect(service.mode()).toBe('hybrid');

    service.toggleMode();
    expect(service.mode()).toBe('read');

    service.toggleMode();
    expect(service.mode()).toBe('edit');
  });

  it('marks the content as dirty when edited', () => {
    service.setContent('new content');
    expect(service.content()).toBe('new content');
    expect(service.isDirty()).toBe(true);
  });

  it('undoes and redoes grouped edits', () => {
    service.setContent('a');
    service.setContent('ab');
    service.setContent('abc');

    service.undo();
    expect(service.content()).toBe('ab');

    service.undo();
    expect(service.content()).toBe('ab');

    service.redo();
    expect(service.content()).toBe('abc');
    expect(service.canRedo()).toBe(false);
  });

  it('keeps separate history entries for separate edits', () => {
    vi.useFakeTimers();
    service.setContent('a');
    vi.advanceTimersByTime(1000);
    service.setContent('ab');
    vi.advanceTimersByTime(1000);
    service.setContent('abc');

    service.undo();
    expect(service.content()).toBe('ab');
    service.undo();
    expect(service.content()).toBe('a');
    service.undo();
    expect(service.content()).toBe('');
    vi.useRealTimers();
  });

  it('copies the selection to the clipboard', async () => {
    vi.mocked(writeText).mockResolvedValue();
    service.setContent('hello world');
    editorRef.textarea.set(makeTextarea('hello world', 6, 11));

    await service.copySelection();

    expect(writeText).toHaveBeenCalledWith('world');
  });

  it('cuts the selection and removes it from the content', async () => {
    vi.mocked(writeText).mockResolvedValue();
    service.setContent('hello world');
    editorRef.textarea.set(makeTextarea('hello world', 6, 11));

    await service.cutSelection();

    expect(writeText).toHaveBeenCalledWith('world');
    expect(service.content()).toBe('hello ');
  });

  it('pastes the clipboard content at the cursor', async () => {
    vi.mocked(readText).mockResolvedValue('markdown');
    service.setContent('hello ');
    editorRef.textarea.set(makeTextarea('hello ', 6, 6));

    await service.pasteFromClipboard();

    expect(service.content()).toBe('hello markdown');
  });
});

function makeTextarea(value: string, start: number, end: number): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.value = value;
  el.selectionStart = start;
  el.selectionEnd = end;
  return el;
}
