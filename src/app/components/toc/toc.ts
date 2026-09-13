import { Component, inject } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { TocService } from '../../services/toc.service';

@Component({
  selector: 'app-toc',
  templateUrl: './toc.html',
  styleUrl: './toc.css',
})
export class Toc {
  protected readonly toc = inject(TocService);
  protected readonly i18n = inject(I18nService);
}
