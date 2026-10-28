import {
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    afterNextRender(() => this.confirmButton()?.nativeElement.focus());
  }

  protected accept(): void {
    this.confirm.accept();
  }

  protected cancel(): void {
    this.confirm.cancel();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }
}
