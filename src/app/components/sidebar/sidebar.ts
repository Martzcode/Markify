import { Component, computed, inject, input } from '@angular/core';
import { DocumentService } from '../../services/document.service';
import { ExplorerService, type ExplorerEntry } from '../../services/explorer.service';
import { I18nService } from '../../i18n/i18n.service';

@Component({
  selector: 'app-explorer-node',
  imports: [ExplorerNode],
  styleUrl: './explorer-node.css',
  template: `
    <div
      class="node"
      [class.node-selected]="selected()"
      [title]="entry().name"
      [style.padding-left.px]="4 + depth() * 12"
      (click)="onClick()"
    >
      @if (entry().isDir) {
        <span class="node-caret">
          @if (expanded()) {
            <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
          } @else {
            <i class="fa-solid fa-caret-right" aria-hidden="true"></i>
          }
        </span>
        <span class="node-icon node-icon-folder">
          <i class="fa-solid fa-folder-blank" aria-hidden="true"></i>
        </span>
        <span class="node-name">{{ entry().name }}</span>
      } @else {
        <span class="node-caret node-caret-empty"></span>
        <span class="node-icon node-icon-file">
          <i class="fa-solid fa-file" aria-hidden="true"></i>
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
