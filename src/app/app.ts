import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AboutDialog } from './components/about-dialog/about-dialog';
import { ActivityBar } from './components/activity-bar/activity-bar';
import { EditorView } from './components/editor-view/editor-view';
import { Sidebar } from './components/sidebar/sidebar';
import { Toc } from './components/toc/toc';
import { TitleBar } from './components/title-bar/title-bar';
import { I18nService } from './i18n/i18n.service';
import { AboutDialogService } from './services/about-dialog.service';
import { DocumentService } from './services/document.service';
import { ExplorerService } from './services/explorer.service';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import { ToastService } from './services/toast.service';
import { TocService } from './services/toc.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TitleBar, EditorView, Sidebar, Toc, ActivityBar, AboutDialog],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly shortcuts = inject(KeyboardShortcutsService);
  protected readonly i18n = inject(I18nService);
  protected readonly document = inject(DocumentService);
  protected readonly explorer = inject(ExplorerService);
  protected readonly toc = inject(TocService);
  protected readonly toast = inject(ToastService);
  protected readonly about = inject(AboutDialogService);

  constructor() {
    effect(() => {
      const path = this.document.filePath();
      if (path) {
        void this.explorer.revealFile(path);
      }
    });
  }
}
