import { Component, inject } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { ExplorerService } from '../../services/explorer.service';
import { TocService } from '../../services/toc.service';

@Component({
  selector: 'app-activity-bar',
  templateUrl: './activity-bar.html',
  styleUrl: './activity-bar.css',
})
export class ActivityBar {
  protected readonly explorer = inject(ExplorerService);
  protected readonly toc = inject(TocService);
  protected readonly i18n = inject(I18nService);
}
