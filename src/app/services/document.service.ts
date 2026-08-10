import { Injectable, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { I18nService } from '../i18n/i18n.service';

export type EditorMode = 'read' | 'edit';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly i18n = inject(I18nService);

  readonly content = signal('');
  readonly filePath = signal<string | null>(null);
  readonly mode = signal<EditorMode>('read');
  readonly isDirty = signal(false);
  readonly error = signal<string | null>(null);

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
      this.isDirty.set(false);
      this.mode.set('read');
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
    this.mode.set(this.mode() === 'read' ? 'edit' : 'read');
  }
}
