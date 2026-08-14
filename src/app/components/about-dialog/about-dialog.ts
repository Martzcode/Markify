import { HostListener, Component, inject, signal } from '@angular/core';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { I18nService } from '../../i18n/i18n.service';
import { AboutDialogService } from '../../services/about-dialog.service';

export const APP_DEVELOPER = 'Martzcode';
export const APP_PROFILE = `https://github.com/${APP_DEVELOPER}`;

@Component({
  selector: 'app-about-dialog',
  templateUrl: './about-dialog.html',
  styleUrl: './about-dialog.css',
})
export class AboutDialog {
  protected readonly i18n = inject(I18nService);
  protected readonly about = inject(AboutDialogService);
  protected readonly version = signal('');
  protected readonly developer = APP_DEVELOPER;
  protected readonly profile = APP_PROFILE;

  constructor() {
    void getVersion().then((value) => this.version.set(value));
  }

  protected openProfile(event: MouseEvent): void {
    event.preventDefault();
    void openUrl(this.profile);
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.about.close();
    }
  }
}
