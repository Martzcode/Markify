import { Injectable, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { I18nService } from '../i18n/i18n.service';
import { EditorRefService } from './editor-ref.service';
import { ToastService } from './toast.service';
import { generatePdf } from '../utils/pdf-export';
import { renderMarkdownPlain } from '../utils/markdown-render';

export type EditorMode = 'read' | 'edit' | 'hybrid';

const HISTORY_GROUP_MS = 500;

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly editorRef = inject(EditorRefService);

  readonly content = signal('');
  readonly filePath = signal<string | null>(null);
  readonly isOpen = signal(false);
  readonly mode = signal<EditorMode>('read');
  readonly isDirty = signal(false);
  readonly error = signal<string | null>(null);

  private readonly undoStack = signal<string[]>([]);
  private readonly redoStack = signal<string[]>([]);
  private lastEditAt: number | null = null;

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  newFile(): void {
    this.error.set(null);
    this.content.set('');
    this.filePath.set(null);
    this.isOpen.set(true);
    this.isDirty.set(false);
    this.mode.set('edit');
    this.resetHistory();
  }

  async openFile(): Promise<void> {
    this.error.set(null);
    const path = await open({
      title: this.i18n.t('dialog.open.title'),
      filters: [{ name: 'Markdown / MDX', extensions: ['md', 'markdown', 'mdx'] }],
      multiple: false,
    });
    if (typeof path !== 'string') {
      return;
    }
    try {
      const content = await invoke<string>('read_markdown_file', { path });
      this.content.set(content);
      this.filePath.set(path);
      this.isOpen.set(true);
      this.isDirty.set(false);
      this.mode.set('read');
      this.resetHistory();
    } catch (err) {
      this.error.set(String(err));
    }
  }

  async saveFile(): Promise<void> {
    this.error.set(null);
    const existingPath = this.filePath();
    let path = existingPath;
    if (!path) {
      path = await save({
        title: this.i18n.t('dialog.save.title'),
        defaultPath: this.i18n.t('dialog.save.defaultName') + '.md',
        filters: [{ name: 'Markdown / MDX', extensions: ['md', 'markdown', 'mdx'] }],
      });
      if (!path) {
        return;
      }
    }
    try {
      await invoke('write_markdown_file', { path, content: this.content() });
      this.filePath.set(path);
      this.isDirty.set(false);
      if (existingPath) {
        this.toast.show(this.i18n.t('toast.saved'));
      }
    } catch (err) {
      this.error.set(String(err));
    }
  }

  async exportPdf(): Promise<void> {
    this.error.set(null);
    if (!this.isOpen()) {
      return;
    }
    const path = await save({
      title: this.i18n.t('dialog.export.title'),
      defaultPath: this.exportDefaultName() + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!path) {
      return;
    }
    try {
      const result = await generatePdf(renderMarkdownPlain(this.content()), this.documentDir());
      await invoke('write_pdf_file', { path, content: result.bytes });
      if (result.skippedImages.length > 0) {
        this.toast.show(
          this.i18n.t('toast.exportedImagesSkipped', {
            count: String(result.skippedImages.length),
          }),
        );
      } else {
        this.toast.show(this.i18n.t('toast.exported'));
      }
    } catch (err) {
      this.error.set(String(err));
    }
  }

  setContent(content: string): void {
    const previous = this.content();
    if (previous === content) {
      return;
    }
    this.commitHistory(previous);
    this.content.set(content);
    this.isDirty.set(true);
  }

  undo(): void {
    const stack = this.undoStack();
    const previous = stack[stack.length - 1];
    if (previous === undefined) {
      return;
    }
    this.undoStack.set(stack.slice(0, -1));
    this.redoStack.update((redo) => [...redo, this.content()]);
    this.content.set(previous);
    this.isDirty.set(true);
  }

  redo(): void {
    const stack = this.redoStack();
    const next = stack[stack.length - 1];
    if (next === undefined) {
      return;
    }
    this.redoStack.set(stack.slice(0, -1));
    this.undoStack.update((undo) => [...undo, this.content()]);
    this.content.set(next);
    this.isDirty.set(true);
  }

  async copySelection(): Promise<void> {
    const textarea = this.editorRef.textarea();
    if (!textarea) {
      return;
    }
    const { selectionStart: start, selectionEnd: end } = textarea;
    if (start === end) {
      return;
    }
    await writeText(textarea.value.substring(start, end));
  }

  async cutSelection(): Promise<void> {
    const textarea = this.editorRef.textarea();
    if (!textarea) {
      return;
    }
    const { selectionStart: start, selectionEnd: end } = textarea;
    if (start === end) {
      return;
    }
    await writeText(textarea.value.substring(start, end));
    this.setContent(this.content().slice(0, start) + this.content().slice(end));
    this.restoreSelection(textarea, start, start);
  }

  async pasteFromClipboard(): Promise<void> {
    const textarea = this.editorRef.textarea();
    if (!textarea) {
      return;
    }
    const { selectionStart: start, selectionEnd: end } = textarea;
    const text = await readText();
    this.setContent(this.content().slice(0, start) + text + this.content().slice(end));
    this.restoreSelection(textarea, start + text.length, start + text.length);
  }

  private commitHistory(previous: string): void {
    const now = Date.now();
    if (this.lastEditAt !== null && now - this.lastEditAt < HISTORY_GROUP_MS) {
      this.undoStack.update((stack) => {
        const next = [...stack];
        if (next.length > 0) {
          next[next.length - 1] = previous;
        } else {
          next.push(previous);
        }
        return next;
      });
    } else {
      this.undoStack.update((stack) => [...stack, previous]);
    }
    this.lastEditAt = now;
    this.redoStack.set([]);
  }

  private resetHistory(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.lastEditAt = null;
  }

  private restoreSelection(textarea: HTMLTextAreaElement, start: number, end: number): void {
    setTimeout(() => {
      try {
        textarea.setSelectionRange(start, end);
      } catch {
        // selection restore is best-effort
      }
    });
  }

  setMode(mode: EditorMode): void {
    this.mode.set(mode);
  }

  private exportDefaultName(): string {
    const filePath = this.filePath();
    if (filePath) {
      const base = filePath.split(/[\\/]/).pop() ?? '';
      const name = base.replace(/\.(md|markdown|mdx)$/i, '');
      if (name) {
        return name;
      }
    }
    return this.i18n.t('dialog.export.defaultName');
  }

  private documentDir(): string | null {
    const path = this.filePath();
    if (!path) {
      return null;
    }
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return index === -1 ? null : path.slice(0, index);
  }

  toggleMode(): void {
    const order: EditorMode[] = ['read', 'edit', 'hybrid'];
    const index = order.indexOf(this.mode());
    this.mode.set(order[(index + 1) % order.length]);
  }
}
