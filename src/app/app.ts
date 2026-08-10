import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TitleBar } from './components/title-bar/title-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TitleBar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Markify');
}
