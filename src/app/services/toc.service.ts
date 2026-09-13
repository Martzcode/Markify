import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { extractHeadings, type HeadingEntry } from '../utils/markdown-render';

@Injectable({ providedIn: 'root' })
export class TocService {
  private readonly document = inject(DocumentService);
  private readonly injector = inject(Injector);

  readonly visible = signal(false);
  readonly targetId = signal<string | null>(null);

  readonly entries = computed(() => extractHeadings(this.document.content()));

  toggle(): void {
    const next = !this.visible();
    if (next) {
      this.closeOtherPanel();
    }
    this.visible.set(next);
  }

  hide(): void {
    this.visible.set(false);
  }

  show(): void {
    this.closeOtherPanel();
    this.visible.set(true);
  }

  navigate(id: string): void {
    this.targetId.set(id);
  }

  private closeOtherPanel(): void {
    const explorer = this.injector.get(ExplorerService, undefined, { optional: true });
    explorer?.hide();
  }
}
