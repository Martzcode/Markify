import { Injectable, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { I18nService } from '../i18n/i18n.service';
import { ToastService } from './toast.service';

export type EditorMode = 'read' | 'edit' | 'hybrid';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  readonly content = signal('');
  readonly filePath = signal<string | null>(null);
  readonly isOpen = signal(false);
  readonly mode = signal<EditorMode>('read');
  readonly isDirty = signal(false);
  readonly error = signal<string | null>(null);

  newFile(): void {
    this.error.set(null);
    this.content.set('');
    this.filePath.set(null);
    this.isOpen.set(true);
    this.isDirty.set(false);
    this.mode.set('edit');
  }

  async openFile(): Promise<void> {
    this.error.set(null);
    const path = await open({
      title: this.i18n.t('dialog.open.title'),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
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
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
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

  setContent(content: string): void {
    this.content.set(content);
    this.isDirty.set(true);
  }

  setMode(mode: EditorMode): void {
    this.mode.set(mode);
  }

  toggleMode(): void {
    const order: EditorMode[] = ['read', 'edit', 'hybrid'];
    const index = order.indexOf(this.mode());
    this.mode.set(order[(index + 1) % order.length]);
  }
}
