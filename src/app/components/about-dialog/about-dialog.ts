import { HostListener, Component, inject } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { AboutDialogService } from '../../services/about-dialog.service';

export const APP_VERSION = '0.0.0';
export const APP_DEVELOPER = 'Martzcode';

@Component({
  selector: 'app-about-dialog',
  templateUrl: './about-dialog.html',
  styleUrl: './about-dialog.css',
})
export class AboutDialog {
  protected readonly i18n = inject(I18nService);
  protected readonly about = inject(AboutDialogService);
  protected readonly version = APP_VERSION;
  protected readonly developer = APP_DEVELOPER;

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.about.close();
    }
  }
}
