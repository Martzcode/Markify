import { Injectable, OnDestroy, inject } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DocumentService } from './document.service';
import { EditorRefService } from './editor-ref.service';

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService implements OnDestroy {
  private readonly document = inject(DocumentService);
  private readonly editorRef = inject(EditorRefService);
  private readonly win = getCurrentWindow();
  private readonly onKeydown = (event: KeyboardEvent) => this.handleKeydown(event);

  constructor() {
    document.addEventListener('keydown', this.onKeydown);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
  }

  private handleKeydown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && !event.altKey) {
      switch (key) {
        case 'n':
          event.preventDefault();
          this.document.newFile();
          return;
        case 'o':
          event.preventDefault();
          this.document.openFile();
          return;
        case 's':
          event.preventDefault();
          this.document.saveFile();
          return;
        case 'e':
          event.preventDefault();
          this.document.exportPdf();
          return;
        case 'z':
          event.preventDefault();
          if (event.shiftKey) {
            this.document.redo();
          } else {
            this.document.undo();
          }
          return;
        case 'y':
          if (!event.shiftKey) {
            event.preventDefault();
            this.document.redo();
          }
          return;
        case 'x':
          if (!event.shiftKey) {
            this.handleClipboard(event, 'cut');
          }
          return;
        case 'c':
          if (!event.shiftKey) {
            this.handleClipboard(event, 'copy');
          }
          return;
        case 'v':
          if (!event.shiftKey) {
            this.handleClipboard(event, 'paste');
          }
          return;
      }
      return;
    }

    if (event.key === 'F11') {
      event.preventDefault();
      this.toggleFullscreen();
    }
  }

  private handleClipboard(event: KeyboardEvent, action: 'cut' | 'copy' | 'paste'): void {
    const textarea = this.editorRef.textarea();
    if (!textarea || event.target !== textarea) {
      // Sélection hors de l'éditeur (aperçu, etc.) : comportement natif.
      return;
    }
    event.preventDefault();
    switch (action) {
      case 'cut':
        void this.document.cutSelection();
        break;
      case 'copy':
        void this.document.copySelection();
        break;
      case 'paste':
        void this.document.pasteFromClipboard();
        break;
    }
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      const fullscreen = await this.win.isFullscreen();
      await this.win.setFullscreen(!fullscreen);
    } catch {
      // Hors environnement Tauri (tests/navigateur) : ignore.
    }
  }
}
