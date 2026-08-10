import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EditorView } from './components/editor-view/editor-view';
import { TitleBar } from './components/title-bar/title-bar';
import { I18nService } from './i18n/i18n.service';
import { DocumentService } from './services/document.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TitleBar, EditorView],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly document = inject(DocumentService);
}
