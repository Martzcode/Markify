import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { DocumentService, type EditorMode } from './document.service';
import { ExplorerService } from './explorer.service';
import { TocService } from './toc.service';
import { ToastService } from './toast.service';

export const SESSION_STORAGE_KEY = 'markify.session';

const SESSION_VERSION = 1;
const SAVE_DELAY_MS = 500;

export interface ScrollRatios {
  /** Position verticale relative de l'éditeur, entre 0 et 1. */
  editor: number;
  /** Position verticale relative de l'aperçu, entre 0 et 1. */
  preview: number;
}

export interface SessionState {
  version: number;
  filePath: string | null;
  folderPath: string | null;
  mode: EditorMode;
  explorerVisible: boolean;
  tocVisible: boolean;
  expandedPaths: string[];
  scroll: ScrollRatios;
}

const MODES: readonly EditorMode[] = ['read', 'edit', 'hybrid'];
const DEFAULT_SCROLL: ScrollRatios = { editor: 0, preview: 0 };

function isMode(value: unknown): value is EditorMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

function ratio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * Restaure et persiste l'état de travail entre deux lancements : dernier
 * fichier/dossier, mode de vue, panneaux visibles, dossiers dépliés et
 * position de défilement.
 *
 * La géométrie de la fenêtre est gérée nativement par le plugin Tauri
 * `window-state` ; ce service ne s'occupe que de l'état applicatif.
 */
@Injectable({ providedIn: 'root' })
export class SessionService implements OnDestroy {
  private readonly document = inject(DocumentService);
  private readonly explorer = inject(ExplorerService);
  private readonly toc = inject(TocService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** Défilement à appliquer une fois le document restauré rendu. */
  readonly pendingScroll = signal<ScrollRatios | null>(null);

  private scroll: ScrollRatios = { ...DEFAULT_SCROLL };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;

  private readonly onBeforeUnload = () => this.flush();

  constructor() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.flush();
  }

  /**
   * Rouvre le dernier document et l'état des panneaux. Ne passe pas par le
   * garde-fou des modifications (F-01) : rien n'est encore ouvert.
   */
  async restore(): Promise<void> {
    try {
      const state = this.read();
      if (!state) {
        return;
      }
      this.scroll = state.scroll;

      if (
        state.folderPath &&
        !(await this.explorer.openFolderAt(state.folderPath, state.expandedPaths))
      ) {
        this.explorer.reset();
      }

      if (state.filePath) {
        if (await this.document.restorePath(state.filePath)) {
          this.document.setMode(state.mode);
          this.pendingScroll.set(state.scroll);
        } else {
          this.toast.show(
            this.i18n.t('toast.sessionFileMissing', { name: basename(state.filePath) }),
          );
        }
      }

      if (state.explorerVisible && this.explorer.hasRoot()) {
        this.explorer.show();
      } else if (state.tocVisible) {
        this.toc.show();
      }
    } finally {
      this.ready = true;
      this.save();
    }
  }

  /** Programme une sauvegarde différée (les changements arrivent en rafale). */
  scheduleSave(): void {
    if (!this.ready) {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save();
    }, SAVE_DELAY_MS);
  }

  /** Enregistre immédiatement l'état courant. */
  save(): void {
    if (!this.ready) {
      return;
    }
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.snapshot()));
    } catch {
      // Stockage indisponible ou plein : la session est simplement perdue.
    }
  }

  /** Écrit sans attendre le délai de debounce (fermeture de fenêtre). */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.save();
  }

  captureScroll(ratios: Partial<ScrollRatios>): void {
    const next: ScrollRatios = { ...this.scroll, ...ratios };
    if (next.editor === this.scroll.editor && next.preview === this.scroll.preview) {
      return;
    }
    this.scroll = next;
    this.scheduleSave();
  }

  clearPendingScroll(): void {
    this.pendingScroll.set(null);
  }

  private snapshot(): SessionState {
    return {
      version: SESSION_VERSION,
      filePath: this.document.filePath(),
      folderPath: this.explorer.rootPath(),
      mode: this.document.mode(),
      explorerVisible: this.explorer.visible(),
      tocVisible: this.toc.visible(),
      expandedPaths: [...this.explorer.expanded()],
      scroll: this.scroll,
    };
  }

  private read(): SessionState | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) {
      return null;
    }
    try {
      const data = JSON.parse(raw) as Partial<SessionState>;
      if (data.version !== SESSION_VERSION) {
        return null;
      }
      return {
        version: SESSION_VERSION,
        filePath: typeof data.filePath === 'string' ? data.filePath : null,
        folderPath: typeof data.folderPath === 'string' ? data.folderPath : null,
        mode: isMode(data.mode) ? data.mode : 'read',
        explorerVisible: data.explorerVisible === true,
        tocVisible: data.tocVisible === true,
        expandedPaths: Array.isArray(data.expandedPaths)
          ? data.expandedPaths.filter((entry): entry is string => typeof entry === 'string')
          : [],
        scroll: {
          editor: ratio(data.scroll?.editor),
          preview: ratio(data.scroll?.preview),
        },
      };
    } catch {
      return null;
    }
  }
}
