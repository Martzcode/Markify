import { TestBed } from '@angular/core/testing';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { EditorRefService } from './editor-ref.service';
import { ExplorerService } from './explorer.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';

describe('KeyboardShortcutsService', () => {
  let documentService: DocumentService;
  let editorRef: EditorRefService;

  beforeEach(() => {
    TestBed.inject(KeyboardShortcutsService);
    documentService = TestBed.inject(DocumentService);
    editorRef = TestBed.inject(EditorRefService);
  });

  function keydown(
    key: string,
    init: KeyboardEventInit = {},
    target: EventTarget = document.body,
  ): boolean {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('creates a new file with Ctrl+N', () => {
    const spy = vi.spyOn(documentService, 'newFile');

    expect(keydown('n', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('opens a file with Ctrl+O', () => {
    const spy = vi.spyOn(documentService, 'openFile').mockResolvedValue();

    expect(keydown('o', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('opens a folder with Ctrl+Shift+O', () => {
    const explorer = TestBed.inject(ExplorerService);
    const spy = vi.spyOn(explorer, 'openFolder').mockResolvedValue();

    expect(keydown('o', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('toggles the explorer with Ctrl+B', () => {
    const explorer = TestBed.inject(ExplorerService);
    const spy = vi.spyOn(explorer, 'toggle');

    expect(keydown('b', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('saves with Ctrl+S', () => {
    const spy = vi.spyOn(documentService, 'saveFile').mockResolvedValue();

    expect(keydown('s', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('exports a pdf with Ctrl+E', () => {
    const spy = vi.spyOn(documentService, 'exportPdf').mockResolvedValue();

    expect(keydown('e', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('undoes with Ctrl+Z', () => {
    const spy = vi.spyOn(documentService, 'undo');

    expect(keydown('z', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('redoes with Ctrl+Shift+Z', () => {
    const spy = vi.spyOn(documentService, 'redo');

    expect(keydown('z', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('redoes with Ctrl+Y', () => {
    const spy = vi.spyOn(documentService, 'redo');

    expect(keydown('y', { ctrlKey: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  function makeTextarea(): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    return textarea;
  }

  it('cuts the selection with Ctrl+X when the editor is focused', () => {
    const spy = vi.spyOn(documentService, 'cutSelection').mockResolvedValue();
    const textarea = makeTextarea();
    editorRef.textarea.set(textarea);

    expect(keydown('x', { ctrlKey: true }, textarea)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    textarea.remove();
  });

  it('copies the selection with Ctrl+C when the editor is focused', () => {
    const spy = vi.spyOn(documentService, 'copySelection').mockResolvedValue();
    const textarea = makeTextarea();
    editorRef.textarea.set(textarea);

    expect(keydown('c', { ctrlKey: true }, textarea)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    textarea.remove();
  });

  it('pastes with Ctrl+V when the editor is focused', () => {
    const spy = vi.spyOn(documentService, 'pasteFromClipboard').mockResolvedValue();
    const textarea = makeTextarea();
    editorRef.textarea.set(textarea);

    expect(keydown('v', { ctrlKey: true }, textarea)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    textarea.remove();
  });

  it('leaves copy/cut/paste to the native behavior outside the editor', () => {
    const copy = vi.spyOn(documentService, 'copySelection').mockResolvedValue();
    const cut = vi.spyOn(documentService, 'cutSelection').mockResolvedValue();
    const paste = vi.spyOn(documentService, 'pasteFromClipboard').mockResolvedValue();

    expect(keydown('c', { ctrlKey: true })).toBe(false);
    expect(keydown('x', { ctrlKey: true })).toBe(false);
    expect(keydown('v', { ctrlKey: true })).toBe(false);
    expect(copy).not.toHaveBeenCalled();
    expect(cut).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
  });

  it('toggles fullscreen with F11', async () => {
    keydown('F11');

    await vi.waitFor(() => {
      expect(getCurrentWindow().setFullscreen).toHaveBeenCalledWith(true);
    });
  });

  it('ignores unmodified keys', () => {
    const undo = vi.spyOn(documentService, 'undo');
    const save = vi.spyOn(documentService, 'saveFile');

    expect(keydown('z')).toBe(false);
    expect(keydown('s')).toBe(false);
    expect(keydown('F5')).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
