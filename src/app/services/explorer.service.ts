import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { I18nService } from '../i18n/i18n.service';
import { TocService } from './toc.service';

export interface ExplorerEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: ExplorerEntry[];
}

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

function parentDir(p: string): string | null {
  const n = norm(p);
  const index = n.lastIndexOf('/');
  return index === -1 ? null : n.slice(0, index);
}

@Injectable({ providedIn: 'root' })
export class ExplorerService {
  private readonly i18n = inject(I18nService);
  private readonly injector = inject(Injector);
  private readonly childrenCache = new Map<string, ExplorerEntry[]>();

  readonly visible = signal(false);
  readonly rootPath = signal<string | null>(null);
  readonly rootEntries = signal<ExplorerEntry[]>([]);
  readonly expanded = signal<Set<string>>(new Set());
  readonly selectedPath = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasRoot = computed(() => this.rootPath() !== null);

  readonly rootName = computed(() => {
    const path = this.rootPath();
    if (!path) {
      return null;
    }
    const n = norm(path);
    const index = n.lastIndexOf('/');
    return index === -1 ? n : n.slice(index + 1);
  });

  childrenOf(path: string): ExplorerEntry[] | null {
    if (path === this.rootPath()) {
      return this.rootEntries();
    }
    return this.childrenCache.get(norm(path)) ?? null;
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
  }

  async revealFile(filePath: string): Promise<void> {
    const path = norm(filePath);
    const dir = parentDir(path);
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

  private closeToc(): void {
    this.injector.get(TocService, undefined, { optional: true })?.hide();
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

  private async expandAncestors(dir: string): Promise<void> {
    const root = this.rootPath();
    if (!root) {
      return;
    }
    const chain: string[] = [];
    let current = dir;
    while (current && (current === root || current.startsWith(root + '/'))) {
      chain.unshift(current);
      const parent = parentDir(current);
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
