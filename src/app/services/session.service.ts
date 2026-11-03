import { Injectable, OnDestroy, inject } from '@angular/core';
import { PhysicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ExplorerService } from './explorer.service';
import { TabsService, type RestorableTab } from './tabs.service';
import { TocService } from './toc.service';

export const SESSION_STORAGE_KEY = 'markify.session';

const SESSION_VERSION = 2;
const SAVE_DELAY_MS = 500;

export interface ScrollRatios {
  /** Position verticale relative de l'éditeur, entre 0 et 1. */
  editor: number;
  /** Position verticale relative de l'aperçu, entre 0 et 1. */
  preview: number;
}

/** Taille intérieure de la fenêtre, en pixels physiques. */
export interface WindowSize {
  width: number;
  height: number;
}

export interface SessionState {
  version: number;
  tabs: RestorableTab[];
  activeTab: number;
  folderPath: string | null;
  explorerVisible: boolean;
  tocVisible: boolean;
  expandedPaths: string[];
  window: WindowSize | null;
}

/** Ancienne session (version 1) : un seul document ouvert. */
interface LegacySessionState {
  version: 1;
  filePath: string | null;
  folderPath: string | null;
  mode: string;
  explorerVisible: boolean;
  tocVisible: boolean;
  expandedPaths: string[];
  scroll: { editor: number; preview: number };
  window: WindowSize | null;
}

const MODES = ['read', 'edit', 'hybrid'] as const;

function isMode(value: unknown): value is (typeof MODES)[number] {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

function ratio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function validWindowSize(value: unknown): WindowSize | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { width, height } = value as Partial<WindowSize>;
  if (typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function validTab(value: unknown): RestorableTab | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const tab = value as Partial<RestorableTab>;
  const filePath =
    typeof tab.filePath === 'string' && tab.filePath.length > 0 ? tab.filePath : null;
  const content = typeof tab.content === 'string' ? tab.content : null;
  if (filePath === null && content === null) {
    return null;
  }
  const scroll = (tab.scroll ?? {}) as { editor?: unknown; preview?: unknown };
  return {
    filePath,
    content,
    isDirty: tab.isDirty === true,
    mode: isMode(tab.mode) ? tab.mode : 'read',
    scroll: { editor: ratio(scroll.editor), preview: ratio(scroll.preview) },
  };
}

function validTabs(value: unknown): RestorableTab[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(validTab).filter((tab): tab is RestorableTab => tab !== null);
}

/**
 * Restaure et persiste l'état de travail entre deux lancements : onglets
 * ouverts, dossier, panneaux visibles, dossiers dépliés et taille de la
 * fenêtre.
 *
 * La position et l'état maximisé de la fenêtre sont gérés par le plugin Tauri
 * `window-state`. La taille, elle, est réappliquée ici : sur Linux/Wayland, le
 * plugin restaure la taille avant que la fenêtre ne soit affichée et GTK la
 * réduit alors de l'épaisseur de son ombre à chaque lancement.
 */
@Injectable({ providedIn: 'root' })
export class SessionService implements OnDestroy {
  private readonly tabs = inject(TabsService);
  private readonly explorer = inject(ExplorerService);
  private readonly toc = inject(TocService);
  private readonly win = getCurrentWindow();

  private windowSize: WindowSize | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unlistenResize: (() => void) | null = null;
  private applyingSize = false;
  private ready = false;
  private destroyed = false;

  private readonly onBeforeUnload = () => this.flush();

  constructor() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unlistenResize?.();
    this.unlistenResize = null;
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.flush();
  }

  /**
   * Rouvre les onglets et l'état des panneaux. Ne passe pas par le garde-fou
   * des modifications (F-01) : rien n'est encore ouvert.
   */
  async restore(): Promise<void> {
    try {
      const state = this.read();
      if (!state) {
        await this.captureInitialSize();
        this.startTracking();
        return;
      }
      this.windowSize = state.window;
      await this.applyWindowSize(state.window);

      if (
        state.folderPath &&
        !(await this.explorer.openFolderAt(state.folderPath, state.expandedPaths))
      ) {
        this.explorer.reset();
      }

      await this.tabs.restore(state.tabs, state.activeTab);

      if (state.explorerVisible && this.explorer.hasRoot()) {
        this.explorer.show();
      } else if (state.tocVisible) {
        this.toc.show();
      }

      if (this.windowSize === null) {
        await this.captureInitialSize();
      }
      this.startTracking();
    } finally {
      this.ready = true;
      this.save();
    }
  }

  /**
   * Réapplique la taille mémorisée une fois la fenêtre affichée. Sans cela,
   * la restauration du plugin `window-state` se fait trop tôt sous
   * Linux/Wayland et la fenêtre rétrécit de l'épaisseur de son ombre à chaque
   * lancement.
   */
  private async applyWindowSize(size: WindowSize | null): Promise<void> {
    if (size === null) {
      return;
    }
    try {
      if (await this.win.isMaximized()) {
        return;
      }
      this.applyingSize = true;
      await this.win.setSize(new PhysicalSize(size.width, size.height));
    } catch {
      // Permission refusée ou fenêtre indisponible : la taille par défaut reste.
    } finally {
      this.applyingSize = false;
    }
  }

  /** Mémorise la taille courante lors du premier lancement. */
  private async captureInitialSize(): Promise<void> {
    try {
      const size = await this.win.innerSize();
      if (size.width > 0 && size.height > 0) {
        this.windowSize = { width: size.width, height: size.height };
      }
    } catch {
      // Taille indisponible : rien à mémoriser.
    }
  }

  private startTracking(): void {
    if (this.unlistenResize !== null) {
      return;
    }
    void this.win
      .onResized((event) => this.onResized(event.payload))
      .then((unlisten) => {
        if (this.destroyed) {
          unlisten();
        } else {
          this.unlistenResize = unlisten;
        }
      })
      .catch(() => {
        // Pas d'écouteur : la taille reste celle du dernier enregistrement.
      });
  }

  private async onResized(size: PhysicalSize): Promise<void> {
    if (this.applyingSize || size.width <= 0 || size.height <= 0) {
      return;
    }
    try {
      // La taille d'une fenêtre maximisée n'est pas celle à restaurer.
      if (await this.win.isMaximized()) {
        return;
      }
    } catch {
      return;
    }
    this.windowSize = { width: size.width, height: size.height };
    this.scheduleSave();
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
    if (this.tabs.captureScroll(ratios)) {
      this.scheduleSave();
    }
  }

  private snapshot(): SessionState {
    return {
      version: SESSION_VERSION,
      tabs: this.tabs.serialize(),
      activeTab: Math.max(0, this.tabs.activeIndex()),
      folderPath: this.explorer.rootPath(),
      explorerVisible: this.explorer.visible(),
      tocVisible: this.toc.visible(),
      expandedPaths: [...this.explorer.expanded()],
      window: this.windowSize,
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
      const data = JSON.parse(raw) as Partial<SessionState> & Partial<LegacySessionState>;
      if (data.version === 1) {
        return this.migrateLegacy(data);
      }
      if (data.version !== SESSION_VERSION) {
        return null;
      }
      return {
        version: SESSION_VERSION,
        tabs: validTabs(data.tabs),
        activeTab:
          typeof data.activeTab === 'number' && Number.isFinite(data.activeTab)
            ? Math.max(0, Math.floor(data.activeTab))
            : 0,
        folderPath: typeof data.folderPath === 'string' ? data.folderPath : null,
        explorerVisible: data.explorerVisible === true,
        tocVisible: data.tocVisible === true,
        expandedPaths: Array.isArray(data.expandedPaths)
          ? data.expandedPaths.filter((entry): entry is string => typeof entry === 'string')
          : [],
        window: validWindowSize(data.window),
      };
    } catch {
      return null;
    }
  }

  /** Convertit une session d'avant les onglets en une session à un onglet. */
  private migrateLegacy(data: Partial<LegacySessionState>): SessionState {
    const filePath =
      typeof data.filePath === 'string' && data.filePath.length > 0 ? data.filePath : null;
    const mode = isMode(data.mode) ? data.mode : 'read';
    const scroll = (data.scroll ?? {}) as { editor?: unknown; preview?: unknown };
    return {
      version: SESSION_VERSION,
      tabs: filePath
        ? [
            {
              filePath,
              content: null,
              isDirty: false,
              mode,
              scroll: { editor: ratio(scroll.editor), preview: ratio(scroll.preview) },
            },
          ]
        : [],
      activeTab: 0,
      folderPath: typeof data.folderPath === 'string' ? data.folderPath : null,
      explorerVisible: data.explorerVisible === true,
      tocVisible: data.tocVisible === true,
      expandedPaths: Array.isArray(data.expandedPaths)
        ? data.expandedPaths.filter((entry): entry is string => typeof entry === 'string')
        : [],
      window: validWindowSize(data.window),
    };
  }
}
