import { Component, ElementRef, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface TitleBarMenuItem {
  label: string;
  action?: () => void;
}

export interface TitleBarMenu {
  label: string;
  items: TitleBarMenuItem[];
}

@Component({
  selector: 'app-title-bar',
  templateUrl: './title-bar.html',
  styleUrl: './title-bar.css',
})
export class TitleBar implements OnDestroy {
  private readonly win = getCurrentWindow();
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly unlisteners: Array<() => void> = [];

  protected readonly isMaximized = signal(false);
  protected readonly openMenu = signal<string | null>(null);

  protected readonly menus: TitleBarMenu[] = [
    {
      label: 'File',
      items: [
        { label: 'New File' },
        { label: 'Open…' },
        { label: 'Save' },
        { label: 'Exit', action: () => this.win.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo' },
        { label: 'Redo' },
        { label: 'Cut' },
        { label: 'Copy' },
        { label: 'Paste' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Full Screen', action: () => this.toggleFullScreen() },
      ],
    },
    {
      label: 'Help',
      items: [{ label: 'About Markify' }],
    },
  ];

  constructor() {
    this.win.isMaximized().then((value) => this.isMaximized.set(value));
    this.win
      .onResized(() => {
        this.win.isMaximized().then((value) => this.isMaximized.set(value));
      })
      .then((unlisten) => this.unlisteners.push(unlisten));
  }

  ngOnDestroy(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
  }

  protected onMinimize(): void {
    void this.win.minimize();
  }

  protected onToggleMaximize(): void {
    void this.win.toggleMaximize();
  }

  protected onClose(): void {
    void this.win.close();
  }

  protected toggleMenu(label: string): void {
    this.openMenu.set(this.openMenu() === label ? null : label);
  }

  protected hoverMenu(label: string): void {
    if (this.openMenu() !== null) {
      this.openMenu.set(label);
    }
  }

  protected runItem(item: TitleBarMenuItem): void {
    this.openMenu.set(null);
    item.action?.();
  }

  private async toggleFullScreen(): Promise<void> {
    const fullscreen = await this.win.isFullscreen();
    await this.win.setFullscreen(!fullscreen);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.openMenu.set(null);
    }
  }
}
