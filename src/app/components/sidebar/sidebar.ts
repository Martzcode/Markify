import {
  Component,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  ExplorerService,
  parentDirectory,
  type ExplorerEntry,
} from '../../services/explorer.service';
import { I18nService } from '../../i18n/i18n.service';

/** Place le focus dans le champ de saisie dès son apparition. */
@Directive({ selector: '[appAutoFocus]' })
export class AutoFocus {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      const node = this.element.nativeElement;
      node.focus();
      if (typeof (node as HTMLInputElement).select === 'function') {
        (node as HTMLInputElement).select();
      }
    });
  }
}

/** Saisie inline pour créer ou renommer une entrée de l'explorateur. */
@Component({
  selector: 'app-explorer-name-input',
  imports: [AutoFocus],
  styleUrl: './explorer-node.css',
  template: `
    <div class="node node-editing" [style.padding-left.px]="4 + depth() * 12">
      <span class="node-caret node-caret-empty"></span>
      <span class="node-icon" [class.node-icon-folder]="isDir()" [class.node-icon-file]="!isDir()">
        <i
          class="fa-solid"
          [class.fa-folder-blank]="isDir()"
          [class.fa-file]="!isDir()"
          aria-hidden="true"
        ></i>
      </span>
      <input
        #input
        class="node-input"
        type="text"
        [value]="initial()"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        spellcheck="false"
        autocomplete="off"
        appAutoFocus
        (keydown.enter)="commitValue(input.value)"
        (keydown.escape)="cancel.emit()"
        (blur)="cancel.emit()"
      />
    </div>
  `,
})
export class ExplorerNameInput {
  readonly initial = input('');
  readonly isDir = input(false);
  readonly depth = input(0);
  readonly placeholder = input('');
  readonly commit = output<string>();
  readonly cancel = output<void>();

  protected commitValue(value: string): void {
    const name = value.trim();
    if (name.length === 0) {
      this.cancel.emit();
      return;
    }
    this.commit.emit(name);
  }
}

@Component({
  selector: 'app-explorer-node',
  imports: [ExplorerNameInput],
  styleUrl: './explorer-node.css',
  template: `
    @if (explorer.isRenaming(entry().path)) {
      <app-explorer-name-input
        [initial]="entry().name"
        [isDir]="entry().isDir"
        [depth]="depth()"
        [placeholder]="i18n.t('explorer.namePlaceholder')"
        (commit)="explorer.commitRename($event)"
        (cancel)="explorer.cancelRename()"
      />
    } @else {
      <div
        class="node"
        [class.node-selected]="explorer.isSelected(entry().path)"
        [class.node-drop]="entry().isDir && explorer.isDragOver(entry().path)"
        [title]="entry().name"
        [style.padding-left.px]="4 + depth() * 12"
        draggable="true"
        (click)="onClick()"
        (contextmenu)="onContextMenu($event)"
        (dragstart)="onDragStart($event)"
        (dragend)="explorer.endDrag()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave()"
        (drop)="onDrop($event)"
      >
        @if (entry().isDir) {
          <span class="node-caret">
            @if (explorer.isExpanded(entry().path)) {
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
    }
    @if (entry().isDir && explorer.isExpanded(entry().path)) {
      @if (explorer.isCreatingIn(entry().path)) {
        <app-explorer-name-input
          [isDir]="explorer.creating()?.isDir ?? false"
          [depth]="depth() + 1"
          [placeholder]="i18n.t('explorer.namePlaceholder')"
          (commit)="explorer.commitCreate($event)"
          (cancel)="explorer.cancelCreate()"
        />
      }
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
  protected readonly i18n = inject(I18nService);

  protected readonly children = computed(() => this.explorer.childrenOf(this.entry().path));

  protected onClick(): void {
    this.explorer.open(this.entry());
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.explorer.openContextMenu(event.clientX, event.clientY, this.entry());
  }

  protected onDragStart(event: DragEvent): void {
    const entry = this.entry();
    this.explorer.beginDrag(entry);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', entry.path);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.entry().isDir || !this.explorer.canDropOn(this.entry().path)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.explorer.setDragOver(this.entry().path);
  }

  protected onDragLeave(): void {
    if (this.explorer.isDragOver(this.entry().path)) {
      this.explorer.setDragOver(null);
    }
  }

  protected onDrop(event: DragEvent): void {
    if (!this.entry().isDir || !this.explorer.canDropOn(this.entry().path)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void this.explorer.dropOn(this.entry().path);
  }
}

@Component({
  selector: 'app-sidebar',
  imports: [ExplorerNode, ExplorerNameInput, AutoFocus],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  protected readonly explorer = inject(ExplorerService);
  protected readonly i18n = inject(I18nService);

  protected closeFolder(): void {
    void this.explorer.closeFolder();
  }

  protected newFile(): void {
    const root = this.explorer.rootPath();
    if (root) {
      void this.explorer.beginCreate(root, false);
    }
  }

  protected refresh(): void {
    void this.explorer.refresh();
  }

  protected onContextMenu(event: MouseEvent, entry: ExplorerEntry | null): void {
    event.preventDefault();
    event.stopPropagation();
    this.explorer.openContextMenu(event.clientX, event.clientY, entry);
  }

  protected menuNewFile(): void {
    const parent = this.menuParent();
    if (parent) {
      void this.explorer.beginCreate(parent, false);
    }
  }

  protected menuNewFolder(): void {
    const parent = this.menuParent();
    if (parent) {
      void this.explorer.beginCreate(parent, true);
    }
  }

  protected menuOpen(): void {
    const entry = this.contextEntry();
    if (entry) {
      this.explorer.closeContextMenu();
      this.explorer.open(entry);
    }
  }

  protected menuRename(): void {
    const entry = this.contextEntry();
    if (entry) {
      this.explorer.beginRename(entry);
    }
  }

  protected menuDuplicate(): void {
    const entry = this.contextEntry();
    if (entry) {
      void this.explorer.duplicate(entry);
    }
  }

  protected menuDelete(): void {
    const entry = this.contextEntry();
    if (entry) {
      void this.explorer.remove(entry);
    }
  }

  protected menuReveal(): void {
    void this.explorer.reveal(this.contextEntry());
  }

  protected menuCopyPath(): void {
    void this.explorer.copyPath(this.contextEntry());
  }

  protected menuRefresh(): void {
    void this.explorer.refresh();
  }

  protected onRootDragOver(event: DragEvent): void {
    const root = this.explorer.rootPath();
    if (!root || !this.explorer.canDropOn(root)) {
      return;
    }
    event.preventDefault();
    this.explorer.setDragOver(root);
  }

  protected onRootDragLeave(): void {
    const root = this.explorer.rootPath();
    if (root && this.explorer.isDragOver(root)) {
      this.explorer.setDragOver(null);
    }
  }

  protected onRootDrop(event: DragEvent): void {
    const root = this.explorer.rootPath();
    if (!root || !this.explorer.canDropOn(root)) {
      return;
    }
    event.preventDefault();
    void this.explorer.dropOn(root);
  }

  private contextEntry(): ExplorerEntry | null {
    return this.explorer.contextMenu()?.entry ?? null;
  }

  private menuParent(): string | null {
    const entry = this.contextEntry();
    if (!entry) {
      return this.explorer.rootPath();
    }
    return entry.isDir ? entry.path : parentDirectory(entry.path);
  }
}
