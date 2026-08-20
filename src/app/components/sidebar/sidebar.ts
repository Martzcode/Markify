import { Component, computed, inject, input } from '@angular/core';
import { DocumentService } from '../../services/document.service';
import { ExplorerService, type ExplorerEntry } from '../../services/explorer.service';
import { I18nService } from '../../i18n/i18n.service';

@Component({
  selector: 'app-explorer-node',
  imports: [ExplorerNode],
  template: `
    <div
      class="node"
      [class.node-selected]="selected()"
      [style.padding-left.px]="4 + depth() * 12"
      (click)="onClick()"
    >
      @if (entry().isDir) {
        <span class="node-caret">
          @if (expanded()) {
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          } @else {
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          }
        </span>
        <span class="node-icon node-icon-folder">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M1.5 3.5c0-.55.45-1 1-1h3l1.5 1.5h6c.55 0 1 .45 1 1v7c0 .55-.45 1-1 1h-10.5c-.55 0-1-.45-1-1z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span class="node-name">{{ entry().name }}</span>
      } @else {
        <span class="node-caret node-caret-empty"></span>
        <span class="node-icon node-icon-file">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 1.5h7l3 3v10H3z" fill="none" stroke="currentColor" />
            <path d="M10 1.5v3h3" fill="none" stroke="currentColor" />
          </svg>
        </span>
        <span class="node-name">{{ entry().name }}</span>
      }
    </div>
    @if (entry().isDir && expanded()) {
      @for (child of children() ?? []; track child.path) {
        <app-explorer-node [entry]="child" [depth]="depth() + 1" />
      }
    }
  `,
})
export class ExplorerNode {
  readonly entry = input.required<ExplorerEntry>();
  readonly depth = input(0);

  protected readonly explorer = inject(ExplorerService);
  private readonly document = inject(DocumentService);

  protected readonly expanded = computed(() => this.explorer.expanded().has(this.entry().path));

  protected readonly children = computed(() => this.explorer.childrenOf(this.entry().path));

  protected readonly selected = computed(() => this.explorer.selectedPath() === this.entry().path);

  protected onClick(): void {
    const entry = this.entry();
    if (entry.isDir) {
      void this.explorer.toggleDir(entry.path);
    } else {
      this.explorer.select(entry.path);
      void this.document.openPath(entry.path);
    }
  }
}

@Component({
  selector: 'app-sidebar',
  imports: [ExplorerNode],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  protected readonly explorer = inject(ExplorerService);
  protected readonly i18n = inject(I18nService);
}
