import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open, save } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { I18nService } from '../i18n/i18n.service';
import { DocumentService } from './document.service';
import { EditorRefService } from './editor-ref.service';
import { ImageService } from './image.service';
import { ToastService } from './toast.service';
import { UnsavedChangesService } from './unsaved-changes.service';

describe('DocumentService', () => {
  let service: DocumentService;
  let toast: ToastService;
  let editorRef: EditorRefService;
  let unsaved: UnsavedChangesService;

  beforeEach(() => {
    service = TestBed.inject(DocumentService);
    toast = TestBed.inject(ToastService);
    editorRef = TestBed.inject(EditorRefService);
    unsaved = TestBed.inject(UnsavedChangesService);
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

  it('creates a new file in edit mode', async () => {
    service.setContent('old');
    service.filePath.set('/tmp/old.md');
    service.isOpen.set(true);
    service.setMode('read');
    service.isDirty.set(false);

    await service.newFile();

    expect(service.content()).toBe('');
    expect(service.filePath()).toBeNull();
    expect(service.isOpen()).toBe(true);
    expect(service.mode()).toBe('edit');
    expect(service.isDirty()).toBe(false);
  });

  it('keeps the document when the user cancels the unsaved-changes dialog', async () => {
    service.setContent('draft');
    service.isOpen.set(true);

    const pending = service.newFile();
    expect(unsaved.isOpen()).toBe(true);
    unsaved.resolve('cancel');

    await expect(pending).resolves.toBe(false);
    expect(service.content()).toBe('draft');
    expect(service.isDirty()).toBe(true);
  });

  it('discards changes when the user confirms', async () => {
    service.setContent('draft');
    service.filePath.set('/tmp/draft.md');
    service.isOpen.set(true);

    const pending = service.newFile();
    unsaved.resolve('discard');

    await expect(pending).resolves.toBe(true);
    expect(service.content()).toBe('');
    expect(service.filePath()).toBeNull();
    expect(service.isDirty()).toBe(false);
  });

  it('closes the current document without closing the window', async () => {
    service.setContent('# Hello');
    service.filePath.set('/tmp/hello.md');
    service.isOpen.set(true);
    service.setMode('read');
    service.isDirty.set(false);

    await expect(service.closeFile()).resolves.toBe(true);

    expect(unsaved.isOpen()).toBe(false);
    expect(service.isOpen()).toBe(false);
    expect(service.filePath()).toBeNull();
    expect(service.content()).toBe('');
    expect(service.mode()).toBe('read');
    expect(service.isDirty()).toBe(false);
  });

  it('keeps the document open when closing is cancelled', async () => {
    service.setContent('draft');
    service.filePath.set('/tmp/draft.md');
    service.isOpen.set(true);

    const pending = service.closeFile();
    expect(unsaved.isOpen()).toBe(true);
    unsaved.resolve('cancel');

    await expect(pending).resolves.toBe(false);
    expect(service.isOpen()).toBe(true);
    expect(service.content()).toBe('draft');
  });

  it('closes the document after discarding unsaved changes', async () => {
    service.setContent('draft');
    service.filePath.set('/tmp/draft.md');
    service.isOpen.set(true);

    const pending = service.closeFile();
    unsaved.resolve('discard');

    await expect(pending).resolves.toBe(true);
    expect(service.isOpen()).toBe(false);
    expect(service.filePath()).toBeNull();
    expect(service.content()).toBe('');
    expect(service.canUndo()).toBe(false);
  });

  it('saves changes before switching to a new file', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.setContent('draft');
    service.filePath.set('/tmp/draft.md');
    service.isOpen.set(true);

    const pending = service.newFile();
    unsaved.resolve('save');

    await expect(pending).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/draft.md',
      content: 'draft',
    });
    expect(service.content()).toBe('');
  });

  it('does not open a file when saving is cancelled from the guard', async () => {
    vi.mocked(save).mockResolvedValue(null);
    service.setContent('draft');
    service.isOpen.set(true);

    const pending = service.openFile();
    unsaved.resolve('save');

    await expect(pending).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(service.content()).toBe('draft');
  });

  it('guards opening a file from the explorer', async () => {
    vi.mocked(invoke).mockResolvedValue('# Other');
    service.setContent('draft');
    service.isOpen.set(true);

    const pending = service.openPath('/tmp/other.md');
    unsaved.resolve('discard');

    await expect(pending).resolves.toBe(true);
    expect(service.content()).toBe('# Other');
    expect(service.filePath()).toBe('/tmp/other.md');
  });

  it('does not ask for confirmation when the document is clean', async () => {
    await expect(service.confirmDiscardChanges()).resolves.toBe(true);
    expect(unsaved.isOpen()).toBe(false);
  });

  it('restores a path without showing the unsaved-changes dialog', async () => {
    vi.mocked(invoke).mockResolvedValue('# Restored');
    service.setContent('draft');
    service.isOpen.set(true);

    await expect(service.restorePath('/tmp/restored.md')).resolves.toBe(true);

    expect(unsaved.isOpen()).toBe(false);
    expect(service.content()).toBe('# Restored');
    expect(service.filePath()).toBe('/tmp/restored.md');
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

  it('saves the document under a new path and follows it', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/copy.md');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.filePath.set('/tmp/original.md');
    service.isOpen.set(true);
    service.setContent('# Hello');

    await expect(service.saveAs()).resolves.toBe(true);

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '/tmp/original.md' }));
    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/copy.md',
      content: '# Hello',
    });
    expect(service.filePath()).toBe('/tmp/copy.md');
    expect(service.isDirty()).toBe(false);
    expect(toast.message()).toContain('copy.md');
  });

  it('keeps the document untouched when the save-as dialog is cancelled', async () => {
    vi.mocked(save).mockImplementation(() => Promise.resolve(null));
    service.filePath.set('/tmp/original.md');
    service.isOpen.set(true);
    service.setContent('# Hello');

    await expect(service.saveAs()).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(service.filePath()).toBe('/tmp/original.md');
    expect(service.isDirty()).toBe(true);
  });

  it('does nothing when saving as without an open document', async () => {
    await expect(service.saveAs()).resolves.toBe(false);

    expect(save).not.toHaveBeenCalled();
  });

  it('saves a copy without changing the current file', async () => {
    const suffix = TestBed.inject(I18nService).t('dialog.saveCopy.defaultSuffix');
    vi.mocked(save).mockResolvedValue('/tmp/original-copy.md');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.filePath.set('/tmp/original.md');
    service.isOpen.set(true);
    service.setContent('# Draft');

    await expect(service.saveCopy()).resolves.toBe(true);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: `/tmp/original-${suffix}.md` }),
    );
    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/original-copy.md',
      content: '# Draft',
    });
    expect(service.filePath()).toBe('/tmp/original.md');
    expect(service.isDirty()).toBe(true);
    expect(toast.message()).toContain('original-copy.md');
  });

  it('does nothing when the save-a-copy dialog is cancelled', async () => {
    vi.mocked(save).mockImplementation(() => Promise.resolve(null));
    service.filePath.set('/tmp/original.md');
    service.isOpen.set(true);
    service.setContent('# Draft');

    await expect(service.saveCopy()).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(service.filePath()).toBe('/tmp/original.md');
  });

  it('does nothing when saving a copy without an open document', async () => {
    await expect(service.saveCopy()).resolves.toBe(false);

    expect(save).not.toHaveBeenCalled();
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

  it('inserts a dropped image at the cursor and copies it into assets', async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'save_image_from_path') {
        return './assets/photo.png';
      }
      return undefined;
    });
    service.filePath.set('/tmp/notes/doc.md');
    service.isOpen.set(true);
    service.setMode('edit');
    service.setContent('hello ');
    editorRef.textarea.set(makeTextarea('hello ', 6, 6));

    await service.importImagePaths(['/tmp/photo.png']);

    expect(invoke).toHaveBeenCalledWith('save_image_from_path', {
      documentPath: '/tmp/notes/doc.md',
      sourcePath: '/tmp/photo.png',
    });
    expect(service.content()).toBe('hello \n\n![photo](./assets/photo.png)');
    expect(toast.message()).toBe('Image inserted');
  });

  it('ignores dropped files that are not images', async () => {
    service.filePath.set('/tmp/notes/doc.md');
    service.isOpen.set(true);
    service.setContent('body');

    await service.importImagePaths(['/tmp/notes.txt']);

    expect(invoke).not.toHaveBeenCalled();
    expect(service.content()).toBe('body');
  });

  it('saves the document before inserting an image when it has no path', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/new.md');
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'save_image') {
        return './assets/image.png';
      }
      return undefined;
    });
    service.isOpen.set(true);
    service.setMode('edit');
    service.setContent('body');
    editorRef.textarea.set(makeTextarea('body', 4, 4));

    await service.insertImageBytes(new Uint8Array([1]), 'image.png');

    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/new.md',
      content: 'body',
    });
    expect(invoke).toHaveBeenCalledWith('save_image', {
      documentPath: '/tmp/new.md',
      fileName: 'image.png',
      data: 'AQ==',
    });
    expect(service.filePath()).toBe('/tmp/new.md');
    expect(service.content()).toContain('![image](./assets/image.png)');
  });

  it('does not insert an image when the save dialog is cancelled', async () => {
    vi.mocked(save).mockResolvedValue(null);
    service.isOpen.set(true);
    service.setContent('body');

    await service.insertImageBytes(new Uint8Array([1]), 'image.png');

    expect(invoke).not.toHaveBeenCalled();
    expect(service.content()).toBe('body');
  });

  it('shows a message when inserting an image without an open document', async () => {
    await service.importImagePaths(['/tmp/photo.png']);

    expect(invoke).not.toHaveBeenCalled();
    expect(toast.message()).toBe('Open a document before inserting an image');
  });

  it('pastes a clipboard image instead of text', async () => {
    const images = TestBed.inject(ImageService);
    vi.spyOn(images, 'readClipboardImage').mockResolvedValue({
      bytes: new Uint8Array([1]),
      fileName: 'clip.png',
    });
    vi.mocked(invoke).mockResolvedValue('./assets/clip.png');
    service.filePath.set('/tmp/notes/doc.md');
    service.isOpen.set(true);
    service.setMode('edit');
    service.setContent('x');
    editorRef.textarea.set(makeTextarea('x', 1, 1));

    await service.pasteFromClipboard();

    expect(readText).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('save_image', {
      documentPath: '/tmp/notes/doc.md',
      fileName: 'clip.png',
      data: 'AQ==',
    });
    expect(service.content()).toContain('![clip](./assets/clip.png)');
  });

  it('inserts an image chosen from the file dialog', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/photo.png');
    vi.mocked(invoke).mockResolvedValue('./assets/photo.png');
    service.filePath.set('/tmp/notes/doc.md');
    service.isOpen.set(true);
    service.setMode('edit');
    editorRef.textarea.set(makeTextarea('', 0, 0));

    await service.insertImageFromDialog();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ name: 'Images' })],
      }),
    );
    expect(invoke).toHaveBeenCalledWith('save_image_from_path', {
      documentPath: '/tmp/notes/doc.md',
      sourcePath: '/tmp/photo.png',
    });
    expect(service.content()).toBe('![photo](./assets/photo.png)');
  });

  it('switches to edit mode when an image is inserted from read mode', async () => {
    vi.mocked(invoke).mockResolvedValue('./assets/photo.png');
    service.filePath.set('/tmp/notes/doc.md');
    service.isOpen.set(true);
    service.setMode('read');
    service.setContent('body');
    editorRef.textarea.set(null);

    await service.importImagePaths(['/tmp/photo.png']);

    expect(service.mode()).toBe('edit');
    expect(service.content()).toBe('body\n\n![photo](./assets/photo.png)');
  });
});

function makeTextarea(value: string, start: number, end: number): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.value = value;
  el.selectionStart = start;
  el.selectionEnd = end;
  return el;
}
