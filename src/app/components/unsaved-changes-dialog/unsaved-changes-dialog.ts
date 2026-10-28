import {
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { DocumentService } from '../../services/document.service';
import { UnsavedChangesService } from '../../services/unsaved-changes.service';

@Component({
  selector: 'app-unsaved-changes-dialog',
  templateUrl: './unsaved-changes-dialog.html',
  styleUrl: './unsaved-changes-dialog.css',
})
export class UnsavedChangesDialog {
  protected readonly i18n = inject(I18nService);
  protected readonly unsaved = inject(UnsavedChangesService);
  private readonly document = inject(DocumentService);
  private readonly saveButton = viewChild<ElementRef<HTMLButtonElement>>('saveButton');

  protected readonly fileName = computed(() => {
    const path = this.document.filePath();
    if (!path) {
      return this.i18n.t('unsaved.untitled');
    }
    const parts = path.split(/[\\/]/);
    const name = parts[parts.length - 1];
    return name ? name : this.i18n.t('unsaved.untitled');
  });

  constructor() {
    afterNextRender(() => this.saveButton()?.nativeElement.focus());
  }

  protected save(): void {
    this.unsaved.resolve('save');
  }

  protected discard(): void {
    this.unsaved.resolve('discard');
  }

  protected cancel(): void {
    this.unsaved.resolve('cancel');
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }
}
