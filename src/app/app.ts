import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AboutDialog } from './components/about-dialog/about-dialog';
import { EditorView } from './components/editor-view/editor-view';
import { TitleBar } from './components/title-bar/title-bar';
import { I18nService } from './i18n/i18n.service';
import { AboutDialogService } from './services/about-dialog.service';
import { DocumentService } from './services/document.service';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TitleBar, EditorView, AboutDialog],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly shortcuts = inject(KeyboardShortcutsService);
  protected readonly i18n = inject(I18nService);
  protected readonly document = inject(DocumentService);
  protected readonly toast = inject(ToastService);
  protected readonly about = inject(AboutDialogService);
}
