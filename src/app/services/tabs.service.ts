import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { open } from '@tauri-apps/plugin-dialog';
import { I18nService } from '../i18n/i18n.service';
import { DocumentService, type DocumentSnapshot, type EditorMode } from './document.service';
import { ToastService } from './toast.service';
import type { ScrollRatios } from './session.service';

/** Position de défilement par défaut d'un nouvel onglet. */
export const DEFAULT_SCROLL: ScrollRatios = { editor: 0, preview: 0 };

/** Onglet ouvert : état complet du document + identité et défilement. */
export interface DocumentTab extends DocumentSnapshot {
  id: string;
  scroll: ScrollRatios;
}

/** Onglet tel que persisté dans la session. */
export interface RestorableTab {
  filePath: string | null;
  /** Contenu conservé pour les brouillons non enregistrés ou modifiés. */
  content: string | null;
  isDirty: boolean;
  mode: EditorMode;
  scroll: ScrollRatios;
}

function norm(path: string): string {
  return path.replace(/\\/g, '/');
}

function basename(path: string): string {
  const parts = norm(path).split('/');
  return parts[parts.length - 1] || path;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function isInside(root: string, path: string): boolean {
  const dir = norm(root);
  const file = norm(path);
  return file === dir || file.startsWith(`${dir}/`);
}

function emptyDocument(): DocumentSnapshot {
  return {
    content: '',
    filePath: null,
    isOpen: true,
    mode: 'edit',
    isDirty: false,
    error: null,
    undoStack: [],
    redoStack: [],
    lastEditAt: null,
  };
}

/**
 * Gère les documents ouverts dans des onglets. `DocumentService` reste la
 * façade du document actif : changer d'onglet capture son état, puis restaure
 * celui de l'onglet cible (contenu, chemin, mode, historique, défilement).
 */
@Injectable({ providedIn: 'root' })
export class TabsService {
  private readonly document = inject(DocumentService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  readonly tabs = signal<DocumentTab[]>([]);
  readonly activeId = signal<string | null>(null);

  readonly hasTabs = computed(() => this.tabs().length > 0);
  readonly activeIndex = computed(() => {
    const id = this.activeId();
    return id === null ? -1 : this.tabs().findIndex((tab) => tab.id === id);
  });
  readonly activeTab = computed(
    () => this.tabs().find((tab) => tab.id === this.activeId()) ?? null,
  );

  private counter = 0;

  constructor() {
    // Le document actif est la source de vérité : chaque changement met à jour
    // l'onglet correspondant (indicateur modifié, contenu, historique, mode).
    effect(() => {
      const id = this.activeId();
      if (id === null) {
        return;
      }
      this.patch(id, this.document.snapshot());
    });
  }

  /** Crée un nouvel onglet vide, sans fermer les documents ouverts. */
  newTab(): void {
    this.saveActive();
    const tab = this.createTab(emptyDocument(), DEFAULT_SCROLL);
    this.show(tab);
  }

  /** Ouvre un fichier dans un nouvel onglet, ou active son onglet existant. */
  async openPath(path: string): Promise<boolean> {
    const existing = this.tabs().find(
      (tab) => tab.filePath !== null && norm(tab.filePath) === norm(path),
    );
    if (existing) {
      return this.activate(existing.id);
    }

    this.saveActive();
    let content: string;
    try {
      content = await this.document.readFileContent(path);
    } catch {
      this.toast.show(this.i18n.t('toast.fileOpenFailed', { name: basename(path) }));
      return false;
    }

    const tab = this.createTab(
      {
        content,
        filePath: path,
        isOpen: true,
        mode: 'read',
        isDirty: false,
        error: null,
        undoStack: [],
        redoStack: [],
        lastEditAt: null,
      },
      DEFAULT_SCROLL,
    );
    this.show(tab);
    return true;
  }

  /** Ouvre un ou plusieurs fichiers choisis dans la boîte de dialogue native. */
  async openFileDialog(): Promise<boolean> {
    const selection = await open({
      title: this.i18n.t('dialog.open.title'),
      filters: [{ name: 'Markdown / MDX', extensions: ['md', 'markdown', 'mdx'] }],
      multiple: true,
    });
    if (selection === null) {
      return false;
    }
    const paths = Array.isArray(selection) ? selection : [selection];
    let opened = false;
    for (const path of paths) {
      if (await this.openPath(path)) {
        opened = true;
      }
    }
    return opened;
  }

  /** Active un onglet sans passer par le garde-fou des modifications. */
  activate(id: string): boolean {
    if (id === this.activeId()) {
      return true;
    }
    const tab = this.find(id);
    if (!tab) {
      return false;
    }
    this.saveActive();
    this.show(tab);
    return true;
  }

  /**
   * Ferme un onglet. Si nécessaire, l'onglet est d'abord activé pour que le
   * dialogue « Enregistrer / Ne pas enregistrer / Annuler » porte sur le bon
   * document.
   */
  async closeTab(id: string): Promise<boolean> {
    const tab = this.find(id);
    if (!tab) {
      return false;
    }
    if (this.activeId() !== id && !this.activate(id)) {
      return false;
    }
    if (!(await this.document.confirmDiscardChanges())) {
      return false;
    }
    this.remove(id);
    return true;
  }

  /** Ferme l'onglet actif ; repli sur le document courant hors onglets. */
  closeActive(): Promise<boolean> {
    const id = this.activeId();
    if (id !== null) {
      return this.closeTab(id);
    }
    return this.document.isOpen() ? this.document.closeFile() : Promise.resolve(false);
  }

  /** Ferme les onglets situés sous un dossier, en respectant le garde-fou. */
  async closeTabsUnder(folderPath: string): Promise<boolean> {
    if (this.tabs().length === 0) {
      // Document ouvert hors du gestionnaire d'onglets (tests, intégrations).
      return this.document.isOpen() ? this.document.closeFile() : true;
    }
    for (;;) {
      const tab = this.tabs().find(
        (entry) => entry.filePath !== null && isInside(folderPath, entry.filePath),
      );
      if (!tab) {
        return true;
      }
      if (!(await this.closeTab(tab.id))) {
        return false;
      }
    }
  }

  /** Vérifie tous les onglets modifiés avant la fermeture de la fenêtre. */
  async confirmCloseAll(): Promise<boolean> {
    this.saveActive();
    if (this.tabs().length === 0) {
      // Document ouvert hors du gestionnaire d'onglets (tests, intégrations).
      return this.document.confirmDiscardChanges();
    }
    const originalId = this.activeId();
    const dirty = this.tabs().filter((tab) => tab.isDirty);
    const discarded: string[] = [];
    for (const tab of dirty) {
      if (!this.activate(tab.id)) {
        return false;
      }
      const decision = await this.document.resolveUnsavedChanges();
      if (decision === 'cancel') {
        // Aucun abandon n'a encore été appliqué : annuler laisse tout intact.
        return false;
      }
      if (decision === 'discard') {
        discarded.push(tab.id);
      }
    }
    // La fenêtre va se fermer : on applique les abandons pour que la session
    // ne restaure pas des brouillons que l'utilisateur a refusés.
    for (const id of discarded) {
      if (this.activate(id)) {
        this.document.discardChanges();
        this.saveActive();
      }
    }
    if (originalId !== null && this.find(originalId)) {
      this.activate(originalId);
    }
    return true;
  }

  /** Passe à l'onglet suivant (`offset = 1`) ou précédent (`offset = -1`). */
  cycle(offset: number): void {
    const tabs = this.tabs();
    if (tabs.length < 2) {
      return;
    }
    const index = this.activeIndex();
    const next = (index + offset + tabs.length) % tabs.length;
    this.activate(tabs[next].id);
  }

  /** Déplace un onglet dans la barre (glisser-déposer). */
  moveTab(from: number, to: number): void {
    const tabs = [...this.tabs()];
    if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) {
      return;
    }
    const [tab] = tabs.splice(from, 1);
    tabs.splice(to, 0, tab);
    this.tabs.set(tabs);
  }

  /** Mémorise la position de défilement de l'onglet actif. */
  captureScroll(ratios: Partial<ScrollRatios>): boolean {
    const id = this.activeId();
    if (id === null) {
      return false;
    }
    let changed = false;
    this.tabs.update((tabs) =>
      tabs.map((tab) => {
        if (tab.id !== id) {
          return tab;
        }
        const scroll = {
          editor: ratios.editor === undefined ? tab.scroll.editor : clampRatio(ratios.editor),
          preview: ratios.preview === undefined ? tab.scroll.preview : clampRatio(ratios.preview),
        };
        if (scroll.editor === tab.scroll.editor && scroll.preview === tab.scroll.preview) {
          return tab;
        }
        changed = true;
        return { ...tab, scroll };
      }),
    );
    return changed;
  }

  /** Instantané des onglets pour la session. */
  serialize(): RestorableTab[] {
    this.saveActive();
    return this.tabs().map((tab) => ({
      filePath: tab.filePath,
      // Le contenu n'est conservé que s'il diverge du disque ou n'a pas de fichier.
      content: tab.isDirty || tab.filePath === null ? tab.content : null,
      isDirty: tab.isDirty,
      mode: tab.mode,
      scroll: { ...tab.scroll },
    }));
  }

  /** Restaure les onglets d'une session précédente. */
  async restore(tabs: readonly RestorableTab[], activeIndex: number): Promise<void> {
    this.tabs.set([]);
    this.activeId.set(null);
    this.counter = 0;

    const restored: DocumentTab[] = [];
    for (const saved of tabs) {
      const tab = await this.restoreTab(saved);
      if (tab) {
        restored.push(tab);
      }
    }

    if (restored.length === 0) {
      this.document.reset();
      return;
    }
    const index = Math.min(Math.max(activeIndex, 0), restored.length - 1);
    this.show(restored[index]);
  }

  /** Nom affiché dans l'onglet. */
  title(tab: DocumentTab): string {
    return tab.filePath === null ? this.i18n.t('tabs.untitled') : basename(tab.filePath);
  }

  private async restoreTab(saved: RestorableTab): Promise<DocumentTab | null> {
    const scroll = {
      editor: clampRatio(saved.scroll.editor),
      preview: clampRatio(saved.scroll.preview),
    };
    const base: Omit<DocumentSnapshot, 'content' | 'filePath' | 'isDirty'> = {
      isOpen: true,
      mode: saved.mode,
      error: null,
      undoStack: [],
      redoStack: [],
      lastEditAt: null,
    };

    if (saved.filePath === null) {
      return this.createTab(
        {
          ...base,
          content: saved.content ?? '',
          filePath: null,
          isDirty: saved.isDirty,
        },
        scroll,
      );
    }

    if (saved.isDirty && saved.content !== null) {
      // Brouillon non enregistré : on le restaure tel quel, sans relire le disque.
      return this.createTab(
        {
          ...base,
          content: saved.content,
          filePath: saved.filePath,
          isDirty: true,
        },
        scroll,
      );
    }

    try {
      const content = await this.document.readFileContent(saved.filePath);
      return this.createTab(
        {
          ...base,
          content,
          filePath: saved.filePath,
          isDirty: false,
        },
        scroll,
      );
    } catch {
      this.toast.show(this.i18n.t('toast.sessionFileMissing', { name: basename(saved.filePath) }));
      return null;
    }
  }

  private show(tab: DocumentTab): void {
    this.activeId.set(tab.id);
    this.document.restoreSnapshot(tab);
  }

  private createTab(snapshot: DocumentSnapshot, scroll: ScrollRatios): DocumentTab {
    const tab: DocumentTab = {
      id: `tab-${++this.counter}`,
      ...snapshot,
      undoStack: [...snapshot.undoStack],
      redoStack: [...snapshot.redoStack],
      scroll: { ...scroll },
    };
    this.tabs.update((tabs) => [...tabs, tab]);
    return tab;
  }

  private find(id: string): DocumentTab | undefined {
    return this.tabs().find((tab) => tab.id === id);
  }

  private saveActive(): void {
    const id = this.activeId();
    if (id !== null) {
      this.patch(id, this.document.snapshot());
    }
  }

  private patch(id: string, snapshot: DocumentSnapshot): void {
    this.tabs.update((tabs) =>
      tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              ...snapshot,
              undoStack: [...snapshot.undoStack],
              redoStack: [...snapshot.redoStack],
            }
          : tab,
      ),
    );
  }

  private remove(id: string): void {
    const tabs = this.tabs();
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) {
      return;
    }
    const wasActive = this.activeId() === id;
    this.tabs.set(tabs.filter((tab) => tab.id !== id));
    if (!wasActive) {
      return;
    }
    const remaining = this.tabs();
    const next = remaining[Math.min(index, remaining.length - 1)];
    if (next) {
      this.show(next);
    } else {
      this.activeId.set(null);
      this.document.reset();
    }
  }
}
