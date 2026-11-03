import { Component, inject } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { TabsService, type DocumentTab } from '../../services/tabs.service';

@Component({
  selector: 'app-tabs-bar',
  templateUrl: './tabs-bar.html',
  styleUrl: './tabs-bar.css',
})
export class TabsBar {
  protected readonly tabs = inject(TabsService);
  protected readonly i18n = inject(I18nService);

  private dragIndex: number | null = null;

  protected title(tab: DocumentTab): string {
    return this.tabs.title(tab);
  }

  protected onSelect(id: string): void {
    this.tabs.activate(id);
  }

  protected onKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onSelect(id);
    }
  }

  protected onClose(event: MouseEvent, id: string): void {
    event.stopPropagation();
    void this.tabs.closeTab(id);
  }

  /** Clic molette : fermeture rapide, comme dans un navigateur. */
  protected onAuxClick(event: MouseEvent, id: string): void {
    if (event.button === 1) {
      event.preventDefault();
      void this.tabs.closeTab(id);
    }
  }

  protected onDragStart(event: DragEvent, index: number): void {
    this.dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const raw = this.dragIndex ?? Number(event.dataTransfer?.getData('text/plain'));
    if (Number.isInteger(raw)) {
      this.tabs.moveTab(raw, index);
    }
    this.dragIndex = null;
  }

  protected onDragEnd(): void {
    this.dragIndex = null;
  }
}
