import { Injectable, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { I18nService } from '../i18n/i18n.service';
import { EditorRefService } from './editor-ref.service';
import { ImageService } from './image.service';
import { SecurityService } from './security.service';
import { ToastService } from './toast.service';
import { UnsavedChangesService } from './unsaved-changes.service';
import { generatePdf } from '../utils/pdf-export';
import { imageAltFromPath, isImagePath } from '../utils/image-path';
import { renderMarkdownPlain } from '../utils/markdown-render';

export type EditorMode = 'read' | 'edit' | 'hybrid';

const EDITOR_MODES: readonly EditorMode[] = ['read', 'edit', 'hybrid'];

const HISTORY_GROUP_MS = 500;

/** Dernier segment d'un chemin, quel que soit le séparateur. */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * Construit le chemin proposé pour une copie : même dossier, même extension,
 * suffixe inséré avant l'extension (`note.md` → `note-copie.md`).
 */
function copyPath(path: string, suffix: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dir = path.slice(0, index + 1);
  const base = path.slice(index + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return `${dir}${base}-${suffix}`;
  }
  return `${dir}${base.slice(0, dot)}-${suffix}${base.slice(dot)}`;
}

/** Échappe le texte alternatif pour qu'il ne ferme pas le lien Markdown. */
function escapeAltText(value: string): string {
  return value.replace(/[\\[\]]/g, '\\$&').replace(/\r?\n/g, ' ');
}

interface ImageInsertion {
  src: string;
  alt: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly security = inject(SecurityService);
  private readonly editorRef = inject(EditorRefService);
  private readonly unsavedChanges = inject(UnsavedChangesService);
  private readonly image = inject(ImageService);

  readonly content = signal('');
  readonly filePath = signal<string | null>(null);
  readonly isOpen = signal(false);
  readonly mode = signal<EditorMode>('read');
  readonly isDirty = signal(false);
  readonly error = signal<string | null>(null);

  private readonly undoStack = signal<string[]>([]);
  private readonly redoStack = signal<string[]>([]);
  private lastEditAt: number | null = null;

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  async newFile(): Promise<boolean> {
    if (!(await this.confirmDiscardChanges())) {
      return false;
    }
    this.resetDocument();
    return true;
  }

  private resetDocument(): void {
    this.clearDocument(true, 'edit');
  }

  /**
   * Ferme le document courant et revient à l'écran d'accueil sans fermer la
   * fenêtre. Passe par le garde-fou des modifications (F-01).
   */
  async closeFile(): Promise<boolean> {
    if (!(await this.confirmDiscardChanges())) {
      return false;
    }
    this.clearDocument(false, 'read');
    return true;
  }

  private clearDocument(isOpen: boolean, mode: EditorMode): void {
    this.error.set(null);
    this.content.set('');
    this.filePath.set(null);
    this.isOpen.set(isOpen);
    this.isDirty.set(false);
    this.mode.set(mode);
    this.resetHistory();
  }

  async openFile(): Promise<boolean> {
    if (!(await this.confirmDiscardChanges())) {
      return false;
    }
    this.error.set(null);
    const path = await open({
      title: this.i18n.t('dialog.open.title'),
      filters: [{ name: 'Markdown / MDX', extensions: ['md', 'markdown', 'mdx'] }],
      multiple: false,
    });
    if (typeof path !== 'string') {
      return false;
    }
    return this.loadPath(path);
  }

  async openPath(path: string): Promise<boolean> {
    if (!(await this.confirmDiscardChanges())) {
      return false;
    }
    return this.loadPath(path);
  }

  /**
   * Charge un fichier sans passer par le garde-fou des modifications : utilisé
   * au démarrage pour restaurer la session, alors qu'aucun document n'est
   * encore ouvert.
   */
  restorePath(path: string): Promise<boolean> {
    return this.loadPath(path);
  }

  private async loadPath(path: string): Promise<boolean> {
    this.error.set(null);
    try {
      const content = await invoke<string>('read_markdown_file', { path });
      this.content.set(content);
      this.filePath.set(path);
      this.isOpen.set(true);
      this.isDirty.set(false);
      this.mode.set('read');
      this.resetHistory();
      return true;
    } catch (err) {
      this.error.set(String(err));
      return false;
    }
  }

  /**
   * Vérifie que le document courant peut être abandonné sans perte.
   * Retourne `true` si l'utilisateur a enregistré ou accepté de perdre ses
   * modifications, `false` s'il a annulé ou si l'enregistrement a échoué.
   */
  async confirmDiscardChanges(): Promise<boolean> {
    if (!this.isDirty()) {
      return true;
    }
    const choice = await this.unsavedChanges.confirm();
    if (choice === 'cancel') {
      return false;
    }
    if (choice === 'discard') {
      return true;
    }
    return this.saveFile();
  }

  async saveFile(): Promise<boolean> {
    this.error.set(null);
    const existingPath = this.filePath();
    let path = existingPath;
    if (!path) {
      path = await this.pickSavePath('dialog.save.title', this.defaultSaveName());
      if (!path) {
        return false;
      }
    }
    if (!(await this.writeDocument(path))) {
      return false;
    }
    this.filePath.set(path);
    this.isDirty.set(false);
    if (existingPath) {
      this.toast.show(this.i18n.t('toast.saved'));
    }
    return true;
  }

  /**
   * Enregistre le document sous un nouveau chemin et le rattache à ce
   * fichier : les enregistrements suivants iront dans la nouvelle copie.
   */
  async saveAs(): Promise<boolean> {
    this.error.set(null);
    if (!this.isOpen()) {
      return false;
    }
    const path = await this.pickSavePath(
      'dialog.saveAs.title',
      this.filePath() ?? this.defaultSaveName(),
    );
    if (!path) {
      return false;
    }
    if (!(await this.writeDocument(path))) {
      return false;
    }
    this.filePath.set(path);
    this.isDirty.set(false);
    this.toast.show(this.i18n.t('toast.savedAs', { name: baseName(path) }));
    return true;
  }

  /**
   * Écrit une copie du document à l'emplacement choisi sans changer le fichier
   * courant : le document reste rattaché à son chemin d'origine, avec son état
   * modifié éventuel.
   */
  async saveCopy(): Promise<boolean> {
    this.error.set(null);
    if (!this.isOpen()) {
      return false;
    }
    const source = this.filePath();
    const suffix = this.i18n.t('dialog.saveCopy.defaultSuffix');
    const path = await this.pickSavePath(
      'dialog.saveCopy.title',
      source ? copyPath(source, suffix) : this.defaultSaveName(),
    );
    if (!path) {
      return false;
    }
    if (!(await this.writeDocument(path))) {
      return false;
    }
    this.toast.show(this.i18n.t('toast.copySaved', { name: baseName(path) }));
    return true;
  }

  private defaultSaveName(): string {
    return `${this.i18n.t('dialog.save.defaultName')}.md`;
  }

  private async pickSavePath(
    titleKey: 'dialog.save.title' | 'dialog.saveAs.title' | 'dialog.saveCopy.title',
    defaultPath: string,
  ): Promise<string | null> {
    const path = await save({
      title: this.i18n.t(titleKey),
      defaultPath,
      filters: [{ name: 'Markdown / MDX', extensions: ['md', 'markdown', 'mdx'] }],
    });
    return typeof path === 'string' && path.length > 0 ? path : null;
  }

  private async writeDocument(path: string): Promise<boolean> {
    try {
      await invoke('write_markdown_file', { path, content: this.content() });
      return true;
    } catch (err) {
      this.error.set(String(err));
      return false;
    }
  }

  async exportPdf(): Promise<void> {
    this.error.set(null);
    if (!this.isOpen()) {
      return;
    }
    const path = await save({
      title: this.i18n.t('dialog.export.title'),
      defaultPath: this.exportDefaultName() + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!path) {
      return;
    }
    try {
      const result = await generatePdf(
        renderMarkdownPlain(this.content(), {
          allowRawHtml: this.security.allowRawHtml(),
        }),
        this.documentDir(),
      );
      await invoke('write_pdf_file', { path, content: result.bytes });
      if (result.skippedImages.length > 0) {
        this.toast.show(
          this.i18n.t('toast.exportedImagesSkipped', {
            count: String(result.skippedImages.length),
          }),
        );
      } else {
        this.toast.show(this.i18n.t('toast.exported'));
      }
    } catch (err) {
      this.error.set(String(err));
    }
  }

  setContent(content: string): void {
    const previous = this.content();
    if (previous === content) {
      return;
    }
    this.commitHistory(previous);
    this.content.set(content);
    this.isDirty.set(true);
  }

  undo(): void {
    const stack = this.undoStack();
    const previous = stack[stack.length - 1];
    if (previous === undefined) {
      return;
    }
    this.undoStack.set(stack.slice(0, -1));
    this.redoStack.update((redo) => [...redo, this.content()]);
    this.content.set(previous);
    this.isDirty.set(true);
  }

  redo(): void {
    const stack = this.redoStack();
    const next = stack[stack.length - 1];
    if (next === undefined) {
      return;
    }
    this.redoStack.set(stack.slice(0, -1));
    this.undoStack.update((undo) => [...undo, this.content()]);
    this.content.set(next);
    this.isDirty.set(true);
  }

  async copySelection(): Promise<void> {
    const textarea = this.editorRef.textarea();
    if (!textarea) {
      return;
    }
    const { selectionStart: start, selectionEnd: end } = textarea;
    if (start === end) {
      return;
    }
    await writeText(textarea.value.substring(start, end));
  }

  async cutSelection(): Promise<void> {
    const textarea = this.editorRef.textarea();
    if (!textarea) {
      return;
    }
    const { selectionStart: start, selectionEnd: end } = textarea;
    if (start === end) {
      return;
    }
    await writeText(textarea.value.substring(start, end));
    this.setContent(this.content().slice(0, start) + this.content().slice(end));
    this.restoreSelection(textarea, start, start);
  }

  async pasteFromClipboard(): Promise<void> {
    const textarea = this.editorRef.textarea();
    if (!textarea) {
      return;
    }
    const clipboardImage = await this.image.readClipboardImage();
    if (clipboardImage) {
      await this.insertImageBytes(clipboardImage.bytes, clipboardImage.fileName);
      return;
    }
    const { selectionStart: start, selectionEnd: end } = textarea;
    const text = await readText();
    this.setContent(this.content().slice(0, start) + text + this.content().slice(end));
    this.restoreSelection(textarea, start + text.length, start + text.length);
  }

  /** Ouvre le sélecteur de fichiers puis insère l'image choisie. */
  async insertImageFromDialog(): Promise<void> {
    this.error.set(null);
    if (!this.isOpen()) {
      this.toast.show(this.i18n.t('toast.imageNeedsDocument'));
      return;
    }
    const selected = await open({
      title: this.i18n.t('dialog.image.title'),
      multiple: false,
      filters: [
        {
          name: this.i18n.t('dialog.image.filter'),
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'],
        },
      ],
    });
    if (typeof selected !== 'string') {
      return;
    }
    await this.importImagePaths([selected]);
  }

  /** Copie des fichiers image (glisser-déposer natif) dans `./assets`. */
  async importImagePaths(paths: readonly string[]): Promise<void> {
    const documentPath = await this.ensureImageTarget();
    if (!documentPath) {
      return;
    }
    const images: ImageInsertion[] = [];
    let failed = 0;
    for (const sourcePath of paths) {
      if (!isImagePath(sourcePath)) {
        continue;
      }
      try {
        const link = await this.image.saveImageFromPath(sourcePath, documentPath);
        images.push({ src: link, alt: imageAltFromPath(sourcePath) });
      } catch {
        failed++;
      }
    }
    this.finishImageInsertion(images, failed);
  }

  /** Copie des fichiers image (glisser-déposer HTML5) dans `./assets`. */
  async importImageFiles(files: readonly File[]): Promise<void> {
    const documentPath = await this.ensureImageTarget();
    if (!documentPath) {
      return;
    }
    const images: ImageInsertion[] = [];
    let failed = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/') && !isImagePath(file.name)) {
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const name = file.name || 'image.png';
        const link = await this.image.saveImage(bytes, name, documentPath);
        images.push({ src: link, alt: imageAltFromPath(name) });
      } catch {
        failed++;
      }
    }
    this.finishImageInsertion(images, failed);
  }

  /** Enregistre des octets d'image puis insère le lien Markdown. */
  async insertImageBytes(bytes: Uint8Array, fileName: string): Promise<void> {
    const documentPath = await this.ensureImageTarget();
    if (!documentPath) {
      return;
    }
    try {
      const link = await this.image.saveImage(bytes, fileName, documentPath);
      this.insertImageMarkdown([{ src: link, alt: imageAltFromPath(fileName) }]);
      this.toast.show(this.i18n.t('toast.imageInserted'));
    } catch (err) {
      this.error.set(String(err));
      this.toast.show(this.i18n.t('toast.imageInsertFailed'));
    }
  }

  private finishImageInsertion(images: ImageInsertion[], failed: number): void {
    if (images.length === 0) {
      if (failed > 0) {
        this.toast.show(this.i18n.t('toast.imageInsertFailed'));
      }
      return;
    }
    this.insertImageMarkdown(images);
    this.toast.show(
      this.i18n.t(images.length === 1 ? 'toast.imageInserted' : 'toast.imagesInserted', {
        count: String(images.length),
      }),
    );
  }

  /**
   * Les images sont enregistrées à côté du document : un document jamais
   * enregistré doit d'abord recevoir un chemin.
   */
  private async ensureImageTarget(): Promise<string | null> {
    if (!this.isOpen()) {
      this.toast.show(this.i18n.t('toast.imageNeedsDocument'));
      return null;
    }
    if (!this.filePath()) {
      if (!(await this.saveFile())) {
        return null;
      }
    }
    return this.filePath();
  }

  private insertImageMarkdown(images: readonly ImageInsertion[]): void {
    if (images.length === 0) {
      return;
    }
    if (this.mode() === 'read') {
      this.setMode('edit');
    }
    const fallbackAlt = this.i18n.t('image.defaultAlt');
    const markdown = images
      .map(({ src, alt }) => `![${escapeAltText(alt || fallbackAlt)}](${src})`)
      .join('\n\n');
    this.insertBlock(markdown);
  }

  /** Insère un bloc au curseur, avec les lignes vides nécessaires autour. */
  private insertBlock(markdown: string): void {
    const textarea = this.editorRef.textarea();
    const content = this.content();
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const prefix =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const suffix =
      after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const inserted = `${prefix}${markdown}${suffix}`;
    this.setContent(before + inserted + after);
    const caret = start + inserted.length;
    this.restoreSelection(textarea, caret, caret);
  }

  private commitHistory(previous: string): void {
    const now = Date.now();
    if (this.lastEditAt !== null && now - this.lastEditAt < HISTORY_GROUP_MS) {
      this.undoStack.update((stack) => {
        const next = [...stack];
        if (next.length > 0) {
          next[next.length - 1] = previous;
        } else {
          next.push(previous);
        }
        return next;
      });
    } else {
      this.undoStack.update((stack) => [...stack, previous]);
    }
    this.lastEditAt = now;
    this.redoStack.set([]);
  }

  private resetHistory(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.lastEditAt = null;
  }

  private restoreSelection(textarea: HTMLTextAreaElement | null, start: number, end: number): void {
    if (!textarea) {
      return;
    }
    setTimeout(() => {
      try {
        textarea.setSelectionRange(start, end);
      } catch {
        // selection restore is best-effort
      }
    });
  }

  setMode(mode: EditorMode): void {
    this.mode.set(mode);
  }

  /** Mode qui sera appliqué au prochain clic sur le bouton de mode. */
  nextMode(): EditorMode {
    const index = EDITOR_MODES.indexOf(this.mode());
    return EDITOR_MODES[(index + 1) % EDITOR_MODES.length];
  }

  /** Passe au mode suivant : lecture → édition → hybride → lecture. */
  toggleMode(): void {
    this.setMode(this.nextMode());
  }

  private exportDefaultName(): string {
    const filePath = this.filePath();
    if (filePath) {
      const base = filePath.split(/[\\/]/).pop() ?? '';
      const name = base.replace(/\.(md|markdown|mdx)$/i, '');
      if (name) {
        return name;
      }
    }
    return this.i18n.t('dialog.export.defaultName');
  }

  private documentDir(): string | null {
    const path = this.filePath();
    if (!path) {
      return null;
    }
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return index === -1 ? null : path.slice(0, index);
  }
}
