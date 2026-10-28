import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AboutDialog } from './components/about-dialog/about-dialog';
import { ActivityBar } from './components/activity-bar/activity-bar';
import { EditorView } from './components/editor-view/editor-view';
import { Sidebar } from './components/sidebar/sidebar';
import { Toc } from './components/toc/toc';
import { TitleBar } from './components/title-bar/title-bar';
import { UnsavedChangesDialog } from './components/unsaved-changes-dialog/unsaved-changes-dialog';
import { I18nService } from './i18n/i18n.service';
import { AboutDialogService } from './services/about-dialog.service';
import { DocumentService } from './services/document.service';
import { ExplorerService } from './services/explorer.service';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import { SessionService } from './services/session.service';
import { ToastService } from './services/toast.service';
import { TocService } from './services/toc.service';
import { UnsavedChangesService } from './services/unsaved-changes.service';
import { WindowCloseGuardService } from './services/window-close-guard.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    TitleBar,
    EditorView,
    Sidebar,
    Toc,
    ActivityBar,
    AboutDialog,
    UnsavedChangesDialog,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly shortcuts = inject(KeyboardShortcutsService);
  private readonly closeGuard = inject(WindowCloseGuardService);
  private readonly session = inject(SessionService);
  protected readonly i18n = inject(I18nService);
  protected readonly document = inject(DocumentService);
  protected readonly explorer = inject(ExplorerService);
  protected readonly toc = inject(TocService);
  protected readonly toast = inject(ToastService);
  protected readonly about = inject(AboutDialogService);
  protected readonly unsaved = inject(UnsavedChangesService);

  constructor() {
    void this.shortcuts;
    void this.closeGuard.start();
    void this.session.restore();
    effect(() => {
      const path = this.document.filePath();
      if (path) {
        void this.explorer.revealFile(path);
      }
    });
    effect(() => {
      // Fermer le document masque la table des matières, qui n'a plus d'objet.
      if (!this.document.isOpen()) {
        this.toc.hide();
      }
    });
    effect(() => {
      // Toute modification de l'état de travail est persistée (debounce).
      this.document.filePath();
      this.document.mode();
      this.explorer.visible();
      this.explorer.rootPath();
      this.explorer.expanded();
      this.toc.visible();
      this.session.scheduleSave();
    });
  }
}
