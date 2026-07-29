import { Component, signal } from '@angular/core';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly title = 'Markify';
  readonly content = signal('');
  readonly fileName = signal('');
  readonly loading = signal(false);

  async openFile() {
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
}
