import { Component, inject, OnInit, signal } from '@angular/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { I18nService } from './i18n';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  readonly content = signal('');
  readonly fileName = signal('');

  readonly menuVisible = signal(false);
  readonly menuX = signal(0);
  readonly menuY = signal(0);

  private readonly i18n = inject(I18nService);
  readonly t = (key: string) => this.i18n.t(key);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressStart = { x: 0, y: 0 };
  private menuOpenedAt = 0;

  ngOnInit() {
    void this.i18n.init().catch(() => undefined);
    void listen('menu-open', () => this.openFile()).catch(() => undefined);
    void listen('menu-export', () => this.convertToPdf()).catch(() => undefined);
  }

  async openFile() {
    this.closeMenu();
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!path) {
        return;
      }
      const raw = await invoke<string>('read_file_content', { path });
      this.fileName.set(path.split('/').pop() ?? path.split('\\').pop() ?? path);
      this.content.set(await marked.parse(raw));
    } catch (e) {
      this.content.set(`**${this.t('error_prefix')}:** ${e}`);
    }
  }

  onContextMenu(event: MouseEvent) {
    if (!this.content()) {
      return;
    }
    event.preventDefault();
    this.openMenu(event.clientX, event.clientY);
  }

  onTouchStart(event: TouchEvent) {
    if (!this.content()) {
      return;
    }
    const touch = event.touches[0];
    this.longPressStart = { x: touch.clientX, y: touch.clientY };
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.openMenu(this.longPressStart.x, this.longPressStart.y);
    }, 500);
  }

  onTouchEnd() {
    this.cancelLongPress();
  }

  onTouchMove() {
    this.cancelLongPress();
  }

  onTouchCancel() {
    this.cancelLongPress();
  }

  closeMenu() {
    this.menuVisible.set(false);
  }

  onBackdropClick() {
    if (Date.now() - this.menuOpenedAt > 400) {
      this.closeMenu();
    }
  }

  async convertToPdf() {
    this.closeMenu();
    if (!this.content()) {
      return;
    }
    const baseName = this.fileName().replace(/\.md$/i, '');
    const target = await save({
      defaultPath: `${baseName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!target) {
      return;
    }
    try {
      const [
        { createPdf, addVirtualFileSystem },
        { default: vfsFonts },
        { default: htmlToPdfmake },
      ] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/vfs_fonts'),
        import('html-to-pdfmake'),
      ]);
      addVirtualFileSystem(vfsFonts);
      const doc = {
        info: { title: baseName },
        pageMargins: [48, 64, 48, 64] as [number, number, number, number],
        defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.6 },
        content: htmlToPdfmake(this.content()),
      };
      const blob = await createPdf(doc).getBlob();
      await invoke('write_file', {
        path: target,
        data: Array.from(new Uint8Array(await blob.arrayBuffer())),
      });
    } catch (e) {
      alert(`${this.t('conversion_error')}: ${e}`);
    }
  }

  private cancelLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private openMenu(x: number, y: number) {
    this.menuX.set(Math.max(0, Math.min(x, window.innerWidth - 200)));
    this.menuY.set(Math.max(0, Math.min(y, window.innerHeight - 80)));
    this.menuVisible.set(true);
    this.menuOpenedAt = Date.now();
  }
}
