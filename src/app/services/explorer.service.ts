import { Injectable, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { I18nService } from '../i18n/i18n.service';

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
    this.visible.set(true);
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
    this.visible.update((v) => !v);
  }

  hide(): void {
    this.visible.set(false);
  }

  show(): void {
    this.visible.set(true);
  }

  private async loadRoot(dir: string): Promise<void> {
    this.rootPath.set(dir);
    this.visible.set(true);
    this.loading.set(true);
    this.error.set(null);
    this.selectedPath.set(null);
    this.expanded.set(new Set([dir]));
    try {
      const entries = await invoke<ExplorerEntry[]>('list_directory', { path: dir });
      this.rootEntries.set(entries);
    } catch (err) {
      this.error.set(String(err));
      this.rootEntries.set([]);
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
