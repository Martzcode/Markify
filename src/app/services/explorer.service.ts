import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { I18nService } from '../i18n/i18n.service';
import { ConfirmService } from './confirm.service';
import { DocumentService } from './document.service';
import { TabsService } from './tabs.service';
import { ToastService } from './toast.service';
import { TocService } from './toc.service';

export interface ExplorerEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: ExplorerEntry[];
}

/** Position et cible du menu contextuel de l'explorateur. */
export interface ExplorerContextMenu {
  x: number;
  y: number;
  entry: ExplorerEntry | null;
}

/** Saisie inline en cours de création. */
export interface ExplorerCreation {
  parentPath: string;
  isDir: boolean;
}

/** Saisie inline en cours de renommage. */
export interface ExplorerRenaming {
  path: string;
  isDir: boolean;
}

const MENU_WIDTH = 240;
const MENU_HEIGHT = 360;

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Dossier parent d'un chemin, ou `null` pour une racine. */
export function parentDirectory(p: string): string | null {
  const n = norm(p);
  const index = n.lastIndexOf('/');
  return index === -1 ? null : n.slice(0, index);
}

function baseName(p: string): string {
  const parts = norm(p).split('/');
  return parts[parts.length - 1] || p;
}

function isInside(root: string, path: string): boolean {
  const dir = norm(root);
  const file = norm(path);
  return file === dir || file.startsWith(`${dir}/`);
}

/** Un fichier créé ou renommé reste lisible par l'application. */
function markdownFileName(name: string): string {
  return /\.(md|markdown|mdx)$/i.test(name) ? name : `${name}.md`;
}

@Injectable({ providedIn: 'root' })
export class ExplorerService {
  private readonly i18n = inject(I18nService);
  private readonly injector = inject(Injector);
  private readonly document = inject(DocumentService);
  private readonly tabs = inject(TabsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmService);
  private readonly childrenCache = new Map<string, ExplorerEntry[]>();

  readonly visible = signal(false);
  readonly rootPath = signal<string | null>(null);
  readonly rootEntries = signal<ExplorerEntry[]>([]);
  readonly expanded = signal<Set<string>>(new Set());
  readonly selectedPath = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly contextMenu = signal<ExplorerContextMenu | null>(null);
  readonly creating = signal<ExplorerCreation | null>(null);
  readonly renaming = signal<ExplorerRenaming | null>(null);
  readonly dragged = signal<ExplorerEntry | null>(null);
  readonly dragOverPath = signal<string | null>(null);

  readonly hasRoot = computed(() => this.rootPath() !== null);

  readonly rootName = computed(() => {
    const path = this.rootPath();
    if (!path) {
      return null;
    }
    return baseName(path);
  });

  childrenOf(path: string): ExplorerEntry[] | null {
    if (path === this.rootPath()) {
      return this.rootEntries();
    }
    return this.childrenCache.get(norm(path)) ?? null;
  }

  isExpanded(path: string): boolean {
    return this.expanded().has(norm(path));
  }

  isSelected(path: string): boolean {
    const selected = this.selectedPath();
    return selected !== null && norm(selected) === norm(path);
  }

  isRenaming(path: string): boolean {
    const renaming = this.renaming();
    return renaming !== null && norm(renaming.path) === norm(path);
  }

  isCreatingIn(path: string): boolean {
    const creating = this.creating();
    return creating !== null && norm(creating.parentPath) === norm(path);
  }

  isDragOver(path: string): boolean {
    const target = this.dragOverPath();
    return target !== null && norm(target) === norm(path);
  }

  async openFolder(): Promise<void> {
    const path = await open({
      title: this.i18n.t('dialog.openFolder.title'),
      directory: true,
      multiple: false,
    });
    if (typeof path !== 'string') {
      return;
    }
    await this.loadRoot(norm(path));
  }

  /**
   * Charge un dossier sans boîte de dialogue puis réapplique les dossiers
   * dépliés. Utilisé par la restauration de session au démarrage.
   *
   * @returns `false` si le dossier n'existe plus ou n'est pas lisible.
   */
  async openFolderAt(path: string, expandedPaths: readonly string[] = []): Promise<boolean> {
    const root = norm(path);
    if (!(await this.loadRoot(root))) {
      return false;
    }
    for (const dir of expandedPaths) {
      const n = norm(dir);
      if (n === root || !n.startsWith(root + '/')) {
        continue;
      }
      try {
        await this.expandAncestors(n);
      } catch {
        // Dossier supprimé ou inaccessible depuis la dernière session.
      }
    }
    return true;
  }

  /** Ferme le dossier courant et vide l'arborescence. */
  reset(): void {
    this.visible.set(false);
    this.rootPath.set(null);
    this.rootEntries.set([]);
    this.expanded.set(new Set());
    this.selectedPath.set(null);
    this.loading.set(false);
    this.error.set(null);
    this.childrenCache.clear();
    this.closeContextMenu();
    this.creating.set(null);
    this.renaming.set(null);
    this.endDrag();
  }

  /**
   * Ferme le dossier courant. Si un document est ouvert, demande d'abord
   * confirmation (il sera fermé lui aussi), puis applique le garde-fou des
   * modifications non enregistrées. Renvoie `false` si l'utilisateur annule.
   */
  async closeFolder(): Promise<boolean> {
    if (this.tabs.hasTabs() || this.document.isOpen()) {
      const confirmed = await this.confirmDialog.confirm({
        title: this.i18n.t('confirm.closeFolder.title'),
        message: this.i18n.t('confirm.closeFolder.message', {
          folder: this.rootName() ?? '',
        }),
        confirmLabel: this.i18n.t('confirm.closeFolder.confirm'),
        cancelLabel: this.i18n.t('dialog.cancel'),
      });
      if (!confirmed) {
        return false;
      }
      if (!(await this.tabs.closeTabsUnder(this.rootPath() ?? ''))) {
        return false;
      }
    }
    this.reset();
    return true;
  }

  async revealFile(filePath: string): Promise<void> {
    const path = norm(filePath);
    const dir = parentDirectory(path);
    if (!dir) {
      return;
    }
    const root = this.rootPath();
    if (root === null || !(dir === root || dir.startsWith(root + '/'))) {
      await this.loadRoot(dir);
      this.selectedPath.set(path);
      return;
    }
    this.selectedPath.set(path);
    await this.expandAncestors(dir);
  }

  async toggleDir(path: string): Promise<void> {
    const n = norm(path);
    if (this.expanded().has(n)) {
      this.expanded.update((set) => {
        const next = new Set(set);
        next.delete(n);
        return next;
      });
      return;
    }
    await this.ensureLoaded(n);
    this.expanded.update((set) => new Set([...set, n]));
  }

  select(path: string): void {
    this.selectedPath.set(norm(path));
  }

  /** Ouvre une entrée : déplie un dossier ou active le fichier dans un onglet. */
  open(entry: ExplorerEntry): void {
    if (entry.isDir) {
      void this.toggleDir(entry.path);
      return;
    }
    this.select(entry.path);
    void this.tabs.openPath(entry.path);
  }

  /** Ouvre le menu contextuel sur une entrée, ou sur le fond du dossier. */
  openContextMenu(x: number, y: number, entry: ExplorerEntry | null): void {
    if (entry) {
      this.select(entry.path);
    }
    const maxX = typeof window === 'undefined' ? x : Math.max(0, window.innerWidth - MENU_WIDTH);
    const maxY = typeof window === 'undefined' ? y : Math.max(0, window.innerHeight - MENU_HEIGHT);
    this.contextMenu.set({
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
      entry,
    });
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  /** Affiche une saisie inline de fichier ou de dossier sous `parentPath`. */
  async beginCreate(parentPath: string, isDir: boolean): Promise<void> {
    this.closeContextMenu();
    this.renaming.set(null);
    const parent = norm(parentPath);
    try {
      await this.ensureLoaded(parent);
    } catch {
      // Le dossier n'est peut-être plus lisible : la création échouera proprement.
    }
    this.expanded.update((set) => new Set([...set, parent]));
    this.creating.set({ parentPath: parent, isDir });
  }

  cancelCreate(): void {
    this.creating.set(null);
  }

  /** Valide la saisie inline ; conserve le champ ouvert en cas d'erreur. */
  async commitCreate(name: string): Promise<boolean> {
    const request = this.creating();
    if (!request) {
      return false;
    }
    try {
      const entryName = request.isDir ? name : markdownFileName(name);
      const path = await invoke<string>('create_entry', {
        parent: request.parentPath,
        name: entryName,
        isDir: request.isDir,
      });
      this.creating.set(null);
      await this.refreshDirectory(request.parentPath).catch(() => {});
      this.selectedPath.set(norm(path));
      if (!request.isDir) {
        await this.tabs.openPath(path);
      }
      return true;
    } catch (err) {
      this.toastError('toast.entryCreateFailed', err);
      return false;
    }
  }

  beginRename(entry: ExplorerEntry): void {
    this.closeContextMenu();
    this.creating.set(null);
    this.select(entry.path);
    this.renaming.set({ path: norm(entry.path), isDir: entry.isDir });
  }

  cancelRename(): void {
    this.renaming.set(null);
  }

  /** Renomme une entrée et met à jour les onglets ouverts sous son chemin. */
  async commitRename(newName: string): Promise<boolean> {
    const request = this.renaming();
    if (!request) {
      return false;
    }
    try {
      const entryName = request.isDir ? newName : markdownFileName(newName);
      const newPath = await invoke<string>('rename_entry', {
        path: request.path,
        newName: entryName,
      });
      this.renaming.set(null);
      this.tabs.rebasePath(request.path, newPath);
      this.selectedPath.set(norm(newPath));
      const parent = parentDirectory(request.path);
      if (parent) {
        await this.refreshDirectory(parent).catch(() => {});
      }
      return true;
    } catch (err) {
      this.toastError('toast.entryRenameFailed', err);
      return false;
    }
  }

  /** Duplique un fichier ou un dossier sans écraser une entrée existante. */
  async duplicate(entry: ExplorerEntry): Promise<boolean> {
    this.closeContextMenu();
    try {
      const path = await invoke<string>('duplicate_entry', {
        path: entry.path,
        suffix: this.i18n.t('explorer.copySuffix'),
      });
      const parent = parentDirectory(entry.path);
      if (parent) {
        await this.refreshDirectory(parent).catch(() => {});
      }
      this.selectedPath.set(norm(path));
      return true;
    } catch (err) {
      this.toastError('toast.entryDuplicateFailed', err);
      return false;
    }
  }

  /** Envoie une entrée à la corbeille après confirmation et fermeture des onglets. */
  async remove(entry: ExplorerEntry): Promise<boolean> {
    this.closeContextMenu();
    const confirmed = await this.confirmDialog.confirm({
      title: this.i18n.t('confirm.deleteEntry.title'),
      message: this.i18n.t('confirm.deleteEntry.message', { name: entry.name }),
      confirmLabel: this.i18n.t('confirm.deleteEntry.confirm'),
      cancelLabel: this.i18n.t('dialog.cancel'),
    });
    if (!confirmed) {
      return false;
    }
    if (!(await this.tabs.closeTabsUnder(entry.path))) {
      return false;
    }
    try {
      await invoke('delete_entry', { path: entry.path });
      this.expanded.update((set) => {
        const next = new Set(set);
        for (const dir of next) {
          if (isInside(entry.path, dir)) {
            next.delete(dir);
          }
        }
        return next;
      });
      const selected = this.selectedPath();
      if (selected !== null && isInside(entry.path, selected)) {
        this.selectedPath.set(null);
      }
      const parent = parentDirectory(entry.path);
      if (parent) {
        await this.refreshDirectory(parent).catch(() => {});
      }
      return true;
    } catch (err) {
      this.toastError('toast.entryDeleteFailed', err);
      return false;
    }
  }

  /** Révèle une entrée dans le gestionnaire de fichiers du système. */
  async reveal(entry: ExplorerEntry | null): Promise<void> {
    this.closeContextMenu();
    const path = entry?.path ?? this.rootPath();
    if (!path) {
      return;
    }
    try {
      await revealItemInDir(path);
    } catch (err) {
      this.toastError('toast.revealFailed', err);
    }
  }

  /** Copie le chemin absolu d'une entrée (ou la racine) dans le presse-papiers. */
  async copyPath(entry: ExplorerEntry | null): Promise<void> {
    this.closeContextMenu();
    const path = entry?.path ?? this.rootPath();
    if (!path) {
      return;
    }
    try {
      await writeText(path);
      this.toast.show(this.i18n.t('toast.pathCopied'));
    } catch (err) {
      this.toastError('toast.pathCopyFailed', err);
    }
  }

  /** Relit le dossier et ses sous-dossiers dépliés depuis le disque. */
  async refresh(): Promise<void> {
    this.closeContextMenu();
    const root = this.rootPath();
    if (!root) {
      return;
    }
    const expanded = [...this.expanded()];
    const selected = this.selectedPath();
    this.childrenCache.clear();
    if (!(await this.loadRoot(root))) {
      return;
    }
    for (const dir of expanded) {
      const n = norm(dir);
      if (n === root || !n.startsWith(root + '/')) {
        continue;
      }
      try {
        await this.ensureLoaded(n);
        this.expanded.update((set) => new Set([...set, n]));
      } catch {
        // Dossier supprimé entre-temps.
      }
    }
    this.selectedPath.set(selected === null ? null : norm(selected));
  }

  beginDrag(entry: ExplorerEntry): void {
    this.closeContextMenu();
    this.dragged.set(entry);
  }

  endDrag(): void {
    this.dragged.set(null);
    this.dragOverPath.set(null);
  }

  setDragOver(path: string | null): void {
    this.dragOverPath.set(path);
  }

  canDropOn(targetDir: string): boolean {
    const entry = this.dragged();
    return entry !== null && this.canMove(entry, targetDir);
  }

  /** Déplace l'entrée en cours de glissement vers `targetDir`. */
  async dropOn(targetDir: string): Promise<boolean> {
    const entry = this.dragged();
    this.endDrag();
    if (!entry || !this.canMove(entry, targetDir)) {
      return false;
    }
    return this.moveEntry(entry, targetDir);
  }

  /** Déplace une entrée puis met à jour les onglets ouverts sous son chemin. */
  async moveEntry(entry: ExplorerEntry, targetDir: string): Promise<boolean> {
    const target = norm(targetDir);
    try {
      const newPath = await invoke<string>('move_entry', {
        path: entry.path,
        targetDir,
      });
      this.tabs.rebasePath(entry.path, newPath);
      this.selectedPath.set(norm(newPath));
      this.expanded.update((set) => new Set([...set, target]));
      const sourceParent = parentDirectory(entry.path);
      if (sourceParent) {
        await this.refreshDirectory(sourceParent).catch(() => {});
      }
      if (sourceParent !== target) {
        await this.refreshDirectory(target).catch(() => {});
      }
      return true;
    } catch (err) {
      this.toastError('toast.entryMoveFailed', err);
      return false;
    }
  }

  toggle(): void {
    const next = !this.visible();
    if (next) {
      this.closeToc();
    }
    this.visible.update(() => next);
  }

  hide(): void {
    this.visible.set(false);
  }

  show(): void {
    this.closeToc();
    this.visible.set(true);
  }

  private canMove(entry: ExplorerEntry, targetDir: string): boolean {
    const source = norm(entry.path);
    const target = norm(targetDir);
    if (source === target) {
      return false;
    }
    if (parentDirectory(entry.path) === target) {
      return false;
    }
    return !(entry.isDir && target.startsWith(source + '/'));
  }

  private closeToc(): void {
    this.injector.get(TocService, undefined, { optional: true })?.hide();
  }

  private toastError(
    key:
      | 'toast.entryCreateFailed'
      | 'toast.entryRenameFailed'
      | 'toast.entryDuplicateFailed'
      | 'toast.entryDeleteFailed'
      | 'toast.entryMoveFailed'
      | 'toast.revealFailed'
      | 'toast.pathCopyFailed',
    err: unknown,
  ): void {
    this.toast.show(this.i18n.t(key, { message: String(err) }));
  }

  private async loadRoot(dir: string): Promise<boolean> {
    this.rootPath.set(dir);
    this.loading.set(true);
    this.error.set(null);
    this.selectedPath.set(null);
    this.expanded.set(new Set([dir]));
    try {
      const entries = await invoke<ExplorerEntry[]>('list_directory', { path: dir });
      this.rootEntries.set(entries);
      return true;
    } catch (err) {
      this.error.set(String(err));
      this.rootEntries.set([]);
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Applique des changements externes à l'arborescence (F-18). Seuls les
   * dossiers déjà chargés sont relus : aucun dossier n'est découvert ni chargé
   * à cause d'une simple notification du système de fichiers.
   */
  async applyExternalChanges(paths: readonly string[]): Promise<void> {
    const root = this.rootPath();
    if (!root) {
      return;
    }
    const directories = new Set<string>();
    for (const path of paths) {
      const normalized = norm(path);
      if (!isInside(root, normalized)) {
        continue;
      }
      const parent = parentDirectory(normalized);
      if (parent !== null && this.isLoadedDirectory(parent)) {
        directories.add(parent);
      }
      if (this.isLoadedDirectory(normalized)) {
        directories.add(normalized);
      }
    }
    for (const dir of directories) {
      await this.refreshDirectory(dir).catch(() => {});
    }
  }

  private isLoadedDirectory(dir: string): boolean {
    const normalized = norm(dir);
    return normalized === this.rootPath() || this.childrenCache.has(normalized);
  }

  /** Relit un seul dossier sans réinitialiser le reste de l'arborescence. */
  private async refreshDirectory(dir: string): Promise<void> {
    const entries = await invoke<ExplorerEntry[]>('list_directory', { path: dir });
    if (norm(dir) === this.rootPath()) {
      this.rootEntries.set(entries);
    } else {
      this.childrenCache.set(norm(dir), entries);
    }
  }

  private async expandAncestors(dir: string): Promise<void> {
    const root = this.rootPath();
    if (!root) {
      return;
    }
    const chain: string[] = [];
    let current = dir;
    while (current && (current === root || current.startsWith(root + '/'))) {
      chain.unshift(current);
      const parent = parentDirectory(current);
      if (!parent) {
        break;
      }
      current = parent;
    }
    for (const dirPath of chain) {
      await this.ensureLoaded(dirPath);
      this.expanded.update((set) => new Set([...set, dirPath]));
    }
  }

  private async ensureLoaded(dir: string): Promise<void> {
    const n = norm(dir);
    if (this.childrenCache.has(n)) {
      return;
    }
    const entries = await invoke<ExplorerEntry[]>('list_directory', { path: n });
    this.childrenCache.set(n, entries);
  }
}
