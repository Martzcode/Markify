import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { I18nService } from '../../i18n/i18n.service';
import { LANG_NAMES, SUPPORTED_LANGS } from '../../i18n/translations';
import { DocumentService } from '../../services/document.service';

export interface TitleBarMenuItem {
  label: string;
  checked?: boolean;
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
  protected readonly i18n = inject(I18nService);
  protected readonly document = inject(DocumentService);
  private readonly unlisteners: Array<() => void> = [];

  protected readonly isMaximized = signal(false);
  protected readonly openMenu = signal<string | null>(null);

  protected readonly menus = computed<TitleBarMenu[]>(() => [
    {
      label: this.i18n.t('menu.file'),
      items: [
        { label: this.i18n.t('menu.file.new') },
        {
          label: this.i18n.t('menu.file.open'),
          action: () => this.document.openFile(),
        },
        { label: this.i18n.t('menu.file.save') },
        { label: this.i18n.t('menu.file.exit'), action: () => this.win.close() },
      ],
    },
    {
      label: this.i18n.t('menu.edit'),
      items: [
        { label: this.i18n.t('menu.edit.undo') },
        { label: this.i18n.t('menu.edit.redo') },
        { label: this.i18n.t('menu.edit.cut') },
        { label: this.i18n.t('menu.edit.copy') },
        { label: this.i18n.t('menu.edit.paste') },
      ],
    },
    {
      label: this.i18n.t('menu.view'),
      items: [
        {
          label: this.i18n.t('menu.view.fullscreen'),
          action: () => this.toggleFullScreen(),
        },
        {
          label: this.i18n.t('menu.view.readMode'),
          checked: this.document.mode() === 'read',
          action: () => this.document.setMode('read'),
        },
        {
          label: this.i18n.t('menu.view.editMode'),
          checked: this.document.mode() === 'edit',
          action: () => this.document.setMode('edit'),
        },
      ],
    },
    {
      label: this.i18n.t('menu.language'),
      items: SUPPORTED_LANGS.map((lang) => ({
        label: LANG_NAMES[lang],
        checked: this.i18n.currentLang() === lang,
        action: () => this.i18n.setLang(lang),
      })),
    },
    {
      label: this.i18n.t('menu.help'),
      items: [{ label: this.i18n.t('menu.help.about') }],
    },
  ]);

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
