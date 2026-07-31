import { Component, signal } from '@angular/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly title = 'Markify';
  readonly content = signal('');
  readonly fileName = signal('');
  readonly loading = signal(false);

  readonly menuVisible = signal(false);
  readonly menuX = signal(0);
  readonly menuY = signal(0);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressStart = { x: 0, y: 0 };
  private menuOpenedAt = 0;

  async openFile() {
    this.closeMenu();
    this.loading.set(true);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!path) {
        this.loading.set(false);
        return;
      }
      const raw = await invoke<string>('read_file_content', { path });
      this.fileName.set(path.split('/').pop() ?? path.split('\\').pop() ?? path);
      this.content.set(await marked.parse(raw));
    } catch (e) {
      this.content.set(`**Error:** ${e}`);
    }
    this.loading.set(false);
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
      alert(`Erreur lors de la conversion : ${e}`);
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
