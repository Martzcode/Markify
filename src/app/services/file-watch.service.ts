import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { I18nService } from '../i18n/i18n.service';
import { ConfirmService } from './confirm.service';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { TabsService } from './tabs.service';

/** Charge utile de l'événement `fs-changed` émis par le backend Rust. */
export interface FsChangedPayload {
  paths: string[];
}

/** Regroupement côté frontend des changements de dossier (en ms). */
const SYNC_DEBOUNCE_MS = 150;

/** Regroupement des notifications déjà dégroupées par Rust (en ms). */
const EVENT_COALESCE_MS = 25;

function normalize(path: string): string {
  const replaced = path.replace(/\\/g, '/');
  const trimmed = replaced.replace(/\/+$/, '');
  return trimmed === '' && replaced.startsWith('/') ? '/' : trimmed;
}

function baseName(path: string): string {
  const parts = normalize(path).split('/');
  return parts[parts.length - 1] || path;
}

function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:/.test(path) || path.startsWith('//');
}

function samePath(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) {
    return true;
  }
  return isWindowsPath(left) || isWindowsPath(right)
    ? left.toLowerCase() === right.toLowerCase()
    : false;
}

function pathKey(path: string): string {
  const normalized = normalize(path);
  return isWindowsPath(normalized) ? normalized.toLowerCase() : normalized;
}

function parentOf(path: string): string | null {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf('/');
  if (index <= 0) {
    return null;
  }
  const parent = normalized.slice(0, index);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

function isInside(root: string, path: string): boolean {
  const dir = normalize(root);
  const file = normalize(path);
  return file === dir || file.startsWith(`${dir}/`);
}

/**
 * Détecte les modifications faites hors de Markify (F-18).
 *
 * Le backend Rust ne surveille que les dossiers réellement utiles
 * (racine de l'explorateur, dossiers dépliés et parents des onglets), sans
 * récursion ni scrutation. Les notifications y sont regroupées avant d'être
 * envoyées ici ; ce service ne relit que les fichiers effectivement ouverts et
 * ne rafraîchit que les dossiers déjà chargés.
 */
@Injectable({ providedIn: 'root' })
export class FileWatchService {
  private readonly document = inject(DocumentService);
  private readonly tabs = inject(TabsService);
  private readonly explorer = inject(ExplorerService);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);

  /**
   * Liste stable des dossiers à surveiller. Le `computed` compare les chemins,
   * pas le contenu des onglets : une frappe ne déclenche donc aucun IPC.
   */
  private readonly desiredPaths = computed(
    () => {
      const paths = new Set<string>();
      const root = this.explorer.rootPath();
      if (root) {
        paths.add(normalize(root));
        for (const dir of this.explorer.expanded()) {
          if (isInside(root, dir)) {
            paths.add(normalize(dir));
          }
        }
      }
      for (const tab of this.tabs.tabs()) {
        if (tab.filePath === null) {
          continue;
        }
        const parent = parentOf(tab.filePath);
        if (parent !== null) {
          paths.add(parent);
        }
      }
      return [...paths].sort();
    },
    {
      // La liste est recalculée à chaque frappe (les onglets changent), mais
      // elle n'émet que si les chemins eux-mêmes changent.
      equal: (a, b) => a.length === b.length && a.every((path, index) => path === b[index]),
    },
  );

  /** Contenu déjà ignoré par l'utilisateur pour éviter les relances en boucle. */
  private readonly ignored = new Map<string, string>();

  private unlisten: UnlistenFn | null = null;
  private started = false;
  private lastSignature = '';
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSync: string[] | null = null;

  private readonly queue = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private processing: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      const paths = this.desiredPaths();
      untracked(() => this.scheduleSync(paths));
    });
  }

  /** Enregistre l'écoute des événements et synchronise les dossiers courants. */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      this.unlisten = await listen<FsChangedPayload>('fs-changed', (event) => {
        this.enqueue(event.payload?.paths ?? []);
      });
    } catch {
      // Aperçu web ou environnement sans Tauri : la surveillance reste inerte.
    }
    this.scheduleSync(untracked(() => this.desiredPaths()));
  }

  /** Arrête la surveillance et retire les watches côté backend. */
  stop(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.started = false;
    if (this.syncTimer !== null) {
      clearTimeout(this.syncTimer);
    }
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }
    this.syncTimer = null;
    this.flushTimer = null;
    this.pendingSync = null;
    this.queue.clear();
    if (this.lastSignature !== '') {
      this.lastSignature = '';
      void Promise.resolve(invoke('set_watched_paths', { paths: [] })).catch(() => {});
    }
  }

  private scheduleSync(paths: readonly string[]): void {
    if (!this.started) {
      return;
    }
    const signature = paths.join('\n');
    if (signature === this.lastSignature) {
      return;
    }
    this.pendingSync = [...paths];
    if (this.syncTimer !== null) {
      return;
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      const next = this.pendingSync;
      this.pendingSync = null;
      if (next === null) {
        return;
      }
      const nextSignature = next.join('\n');
      if (nextSignature === this.lastSignature) {
        return;
      }
      this.lastSignature = nextSignature;
      void Promise.resolve(invoke('set_watched_paths', { paths: next })).catch(() => {
        // Le prochain changement de dossier réessaiera.
        this.lastSignature = '';
      });
    }, SYNC_DEBOUNCE_MS);
  }

  private enqueue(paths: readonly string[]): void {
    for (const path of paths) {
      if (path) {
        this.queue.add(normalize(path));
      }
    }
    if (this.queue.size === 0 || this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, EVENT_COALESCE_MS);
  }

  private flush(): void {
    if (this.queue.size === 0) {
      return;
    }
    const paths = [...this.queue];
    this.queue.clear();
    this.processing = this.processing
      .then(() => this.process(paths))
      .catch(() => {
        // Un échec de lecture ne doit pas bloquer les lots suivants.
      });
  }

  private async process(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      await this.handleExternalFile(path);
    }
    await this.explorer.applyExternalChanges(paths).catch(() => {});
  }

  private async handleExternalFile(path: string): Promise<void> {
    const tab = this.tabs
      .tabs()
      .find((entry) => entry.filePath !== null && samePath(entry.filePath, path));
    if (!tab || tab.filePath === null) {
      return;
    }

    let disk: string;
    try {
      disk = await this.document.readFileContent(tab.filePath);
    } catch {
      // Fichier supprimé ou illisible : l'explorateur reflétera le changement.
      return;
    }

    // Relit l'état : l'utilisateur a pu taper pendant la lecture.
    const latest = this.tabs.tabs().find((entry) => entry.id === tab.id);
    if (!latest || latest.filePath === null) {
      return;
    }
    const isActive = this.tabs.activeId() === latest.id;
    const currentContent = isActive ? this.document.content() : latest.content;
    const isDirty = isActive ? this.document.isDirty() : latest.isDirty;

    if (disk === currentContent) {
      // Enregistrement local (auto-événement) ou notification sans changement.
      return;
    }

    if (!isDirty) {
      this.tabs.applyExternalContent(latest.filePath, disk);
      return;
    }

    const key = pathKey(latest.filePath);
    if (this.ignored.get(key) === disk) {
      return;
    }
    if (this.confirm.isOpen()) {
      // Un autre dialogue est déjà affiché : la prochaine notification
      // reposera la question sans bloquer l'interface.
      return;
    }

    const reload = await this.confirm.confirm({
      title: this.i18n.t('confirm.externalChange.title'),
      message: this.i18n.t('confirm.externalChange.message', {
        name: baseName(latest.filePath),
      }),
      confirmLabel: this.i18n.t('confirm.externalChange.reload'),
      cancelLabel: this.i18n.t('confirm.externalChange.keep'),
    });

    const after = this.tabs.tabs().find((entry) => entry.id === tab.id);
    if (!after || after.filePath === null) {
      return;
    }
    if (reload) {
      this.ignored.delete(key);
      this.tabs.applyExternalContent(after.filePath, disk);
    } else {
      this.ignored.set(key, disk);
    }
  }
}
