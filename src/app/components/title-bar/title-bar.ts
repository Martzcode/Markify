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
import { EditorRefService } from '../../services/editor-ref.service';
import { AboutDialogService } from '../../services/about-dialog.service';

export interface TitleBarMenuItem {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  shortcut?: string;
  action?: () => void;
  submenu?: TitleBarMenu;
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
  private readonly editorRef = inject(EditorRefService);
  private readonly aboutDialog = inject(AboutDialogService);
  private readonly unlisteners: Array<() => void> = [];

  protected readonly isMaximized = signal(false);
  protected readonly openMenu = signal<string | null>(null);
  protected readonly openSubmenu = signal<string | null>(null);
  protected readonly isMac = /Mac/i.test(navigator.userAgent);
  protected readonly modKey = this.isMac ? '⌘' : 'Ctrl+';
  protected readonly redoKey = this.isMac ? '⌘⇧Z' : 'Ctrl+Y';

  protected readonly menus = computed<TitleBarMenu[]>(() => [
    {
      label: this.i18n.t('menu.file'),
      items: [
        {
          label: this.i18n.t('menu.file.new'),
          shortcut: `${this.modKey}N`,
          action: () => this.document.newFile(),
        },
        {
          label: this.i18n.t('menu.file.open'),
          shortcut: `${this.modKey}O`,
          action: () => this.document.openFile(),
        },
        {
          label: this.i18n.t('menu.file.save'),
          shortcut: `${this.modKey}S`,
          action: () => this.document.saveFile(),
        },
        {
          label: this.i18n.t('menu.file.export'),
          shortcut: `${this.modKey}E`,
          disabled: !this.document.isOpen(),
          action: () => this.document.exportPdf(),
        },
        { label: this.i18n.t('menu.file.exit'), action: () => this.win.close() },
      ],
    },
    {
      label: this.i18n.t('menu.edit'),
      items: [
        {
          label: this.i18n.t('menu.edit.undo'),
          shortcut: `${this.modKey}Z`,
          disabled: !this.document.canUndo(),
          action: () => this.document.undo(),
        },
        {
          label: this.i18n.t('menu.edit.redo'),
          shortcut: this.redoKey,
          disabled: !this.document.canRedo(),
          action: () => this.document.redo(),
        },
        {
          label: this.i18n.t('menu.edit.cut'),
          shortcut: `${this.modKey}X`,
          disabled: !this.editorRef.textarea(),
          action: () => this.document.cutSelection(),
        },
        {
          label: this.i18n.t('menu.edit.copy'),
          shortcut: `${this.modKey}C`,
          disabled: !this.editorRef.textarea(),
          action: () => this.document.copySelection(),
        },
        {
          label: this.i18n.t('menu.edit.paste'),
          shortcut: `${this.modKey}V`,
          disabled: !this.editorRef.textarea(),
          action: () => this.document.pasteFromClipboard(),
        },
      ],
    },
    {
      label: this.i18n.t('menu.view'),
      items: [
        {
          label: this.i18n.t('menu.view.fullscreen'),
          shortcut: 'F11',
          action: () => this.toggleFullScreen(),
        },
        {
          label: this.i18n.t('menu.view.mode'),
          submenu: {
            label: this.i18n.t('menu.view.mode'),
            items: [
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
              {
                label: this.i18n.t('menu.view.hybridMode'),
                checked: this.document.mode() === 'hybrid',
                action: () => this.document.setMode('hybrid'),
              },
            ],
          },
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
      items: [
        {
          label: this.i18n.t('menu.help.about'),
          action: () => this.aboutDialog.open(),
        },
      ],
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
    this.openSubmenu.set(null);
  }

  protected hoverMenu(label: string): void {
    if (this.openMenu() !== null) {
      this.openMenu.set(label);
    }
  }

  protected runItem(event: MouseEvent, item: TitleBarMenuItem): void {
    event.stopPropagation();
    this.openMenu.set(null);
    this.openSubmenu.set(null);
    if (!item.disabled) {
      item.action?.();
    }
  }

  private async toggleFullScreen(): Promise<void> {
    const fullscreen = await this.win.isFullscreen();
    await this.win.setFullscreen(!fullscreen);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
      this.openSubmenu.set(null);
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.openMenu.set(null);
      this.openSubmenu.set(null);
    }
  }
}
