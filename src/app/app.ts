import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TitleBar } from './components/title-bar/title-bar';
import { I18nService } from './i18n/i18n.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TitleBar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly i18n = inject(I18nService);
}
