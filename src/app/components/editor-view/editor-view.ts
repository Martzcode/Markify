import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  afterNextRender,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { CodeBlockService } from '../../services/code-block.service';
import { DocumentService } from '../../services/document.service';
import { EditorRefService } from '../../services/editor-ref.service';
import { I18nService } from '../../i18n/i18n.service';
import { ImageService } from '../../services/image.service';
import { SearchService } from '../../services/search.service';
import { SecurityService } from '../../services/security.service';
import { SessionService, type ScrollRatios } from '../../services/session.service';
import { SpellcheckService } from '../../services/spellcheck.service';
import { TocService } from '../../services/toc.service';
import { isImagePath } from '../../utils/image-path';
import { highlightMarkdown } from '../../utils/markdown-highlight';
import { renderMarkdown } from '../../utils/markdown-render';
import { highlightRenderedHtml, renderSearchLayer } from '../../utils/search';
import { SearchBar } from '../search-bar/search-bar';

/** Position verticale relative d'une zone défilante, entre 0 et 1. */
function scrollRatio(element: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const max = element.scrollHeight - element.clientHeight;
  return max > 0 ? Math.min(1, Math.max(0, element.scrollTop / max)) : 0;
}

@Component({
  selector: 'app-editor-view',
  imports: [SearchBar],
  templateUrl: './editor-view.html',
  styleUrl: './editor-view.css',
})
export class EditorView implements OnDestroy {
  protected readonly document = inject(DocumentService);
  protected readonly search = inject(SearchService);
  private readonly codeBlocks = inject(CodeBlockService);
  private readonly security = inject(SecurityService);
  protected readonly spellcheck = inject(SpellcheckService);
  private readonly editorRef = inject(EditorRefService);
  private readonly images = inject(ImageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly i18n = inject(I18nService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toc = inject(TocService);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);
  private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly highlightEl = viewChild<ElementRef<HTMLElement>>('highlight');
  private readonly searchEl = viewChild<ElementRef<HTMLElement>>('searchLayer');
  private readonly previewEl = viewChild<ElementRef<HTMLElement>>('preview');
  private readonly unlisteners: Array<() => void> = [];
  private readonly onPaste = (event: ClipboardEvent) => this.handlePaste(event);
  private lastDropAt = 0;
  private destroyed = false;

  protected readonly renderedHtml = computed(() => {
    const documentPath = this.document.filePath();
    const html = renderMarkdown(this.document.content(), this.i18n.t('code.copy'), {
      lineNumbers: this.codeBlocks.lineNumbers(),
      allowRawHtml: this.security.allowRawHtml(),
      resolveImageSrc: (src) => this.images.previewSrc(src, documentPath),
    });
    const query = this.search.query();
    const highlighted =
      this.search.isOpen() && query !== '' && !this.search.invalidRegex()
        ? highlightRenderedHtml(html, query, this.search.options())
        : html;
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  });

  protected readonly highlightedHtml = computed(() =>
    this.document.content() ? highlightMarkdown(this.document.content()) : '',
  );

  protected readonly searchHtml = computed(() => {
    if (!this.search.isOpen() || this.search.query() === '' || this.search.invalidRegex()) {
      return '';
    }
    return renderSearchLayer(this.document.content(), this.search.matches(), this.search.index());
  });

  constructor() {
    effect(() => {
      const el = this.inputEl()?.nativeElement ?? null;
      if (this.editorRef.textarea() !== el) {
        this.editorRef.textarea.set(el);
      }
    });
    effect(() => {
      const id = this.toc.targetId();
      this.toc.targetId.set(null);
      if (!id) {
        return;
      }
      const target = this.tocTarget(id);
      if (target) {
        target.scrollIntoView({ block: 'start' });
      }
      if (this.document.mode() !== 'read') {
        this.scrollTextareaToHeading(id);
      }
    });
    effect(() => {
      const pending = this.session.pendingScroll();
      if (!pending) {
        return;
      }
      afterNextRender(
        () => {
          this.applyScroll(pending);
          this.session.clearPendingScroll();
        },
        { injector: this.injector },
      );
    });
    effect(() => {
      // On ne suit que le jeton de navigation : une simple frappe dans le
      // document ne doit pas faire sauter l'éditeur sur la première occurrence.
      this.search.navigation();
      if (!this.search.isOpen()) {
        return;
      }
      untracked(() => this.revealCurrentMatch());
    });
    this.host.nativeElement.ownerDocument.addEventListener('paste', this.onPaste);
    void this.listenForFileDrop();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.host.nativeElement.ownerDocument.removeEventListener('paste', this.onPaste);
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners.length = 0;
    // Le document est fermé : la recherche ne doit pas rester ouverte pour le
    // prochain document.
    this.search.close();
  }

  /**
   * Écoute le glisser-déposer natif de Tauri, qui fournit des chemins de
   * fichiers (contrairement au glisser-déposer HTML5 qui fournit des `File`).
   */
  private async listenForFileDrop(): Promise<void> {
    try {
      const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type !== 'drop' || payload.paths.length === 0) {
          return;
        }
        if (!this.isDropInside(payload.position) || !this.claimDrop()) {
          return;
        }
        void this.document.importImagePaths(payload.paths);
      });
      if (this.destroyed) {
        unlisten();
        return;
      }
      this.unlisteners.push(unlisten);
    } catch {
      // Hors Tauri (tests, navigateur) : le glisser-déposer HTML5 reste actif.
    }
  }

  /** Vérifie que le dépôt a eu lieu dans la zone de l'éditeur. */
  private isDropInside(position: { x: number; y: number }): boolean {
    const owner = this.host.nativeElement.ownerDocument;
    const ratio = owner.defaultView?.devicePixelRatio || 1;
    const target = owner.elementFromPoint(position.x / ratio, position.y / ratio);
    return target !== null && this.host.nativeElement.contains(target);
  }

  /**
   * Le dépôt natif et le dépôt HTML5 peuvent se déclencher pour le même geste :
   * seul le premier est traité.
   */
  private claimDrop(): boolean {
    const now = Date.now();
    if (now - this.lastDropAt < 800) {
      return false;
    }
    this.lastDropAt = now;
    return true;
  }

  /**
   * Repli pour le collage d'images : le raccourci clavier passe par Tauri, mais
   * le collage natif (menu contextuel, Shift+Insert) fournit des `File` HTML5.
   */
  private handlePaste(event: ClipboardEvent): void {
    const target = event.target as HTMLElement | null;
    const textarea = this.editorRef.textarea();
    if (
      target &&
      target !== textarea &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    void this.document.importImageFiles(files);
  }

  /**
   * Fait apparaître l'occurrence courante : sélection dans le `textarea` et
   * défilement de l'aperçu. Appelée après chaque navigation (ouverture,
   * requête, précédent/suivant, remplacement).
   */
  private revealCurrentMatch(): void {
    const match = this.search.currentMatch();
    if (!match) {
      return;
    }
    const mode = this.document.mode();
    if (mode !== 'read') {
      const textarea = this.inputEl()?.nativeElement;
      if (textarea) {
        textarea.setSelectionRange(match.start, match.end);
        const top = this.measureLineTop(textarea, match.start);
        const centered = top - Math.max(0, textarea.clientHeight / 2 - 12);
        textarea.scrollTop = Math.max(0, centered);
        this.syncHighlightScroll();
      }
    }
    if (mode !== 'edit') {
      afterNextRender(() => this.scrollPreviewToMatch(), { injector: this.injector });
    }
  }

  private scrollPreviewToMatch(): void {
    const preview = this.previewEl()?.nativeElement;
    if (!preview) {
      return;
    }
    const marks = preview.querySelectorAll<HTMLElement>('mark.search-hit');
    if (marks.length === 0) {
      return;
    }
    const index = Math.min(Math.max(this.search.index(), 0), marks.length - 1);
    marks[index]?.scrollIntoView?.({ block: 'center' });
  }

  /** Applique le défilement restauré une fois le contenu rendu. */
  private applyScroll(ratios: ScrollRatios): void {
    const input = this.inputEl()?.nativeElement;
    if (input) {
      const max = Math.max(0, input.scrollHeight - input.clientHeight);
      input.scrollTop = Math.round(ratios.editor * max);
      this.syncHighlightScroll();
    }
    const preview = this.previewEl()?.nativeElement;
    if (preview) {
      const max = Math.max(0, preview.scrollHeight - preview.clientHeight);
      preview.scrollTop = Math.round(ratios.preview * max);
    }
  }

  private tocTarget(id: string): HTMLElement | null {
    const preview = this.previewEl()?.nativeElement;
    if (!preview) {
      return null;
    }
    return preview.querySelector<HTMLElement>(`#${id}`);
  }

  private scrollTextareaToHeading(id: string): void {
    const textarea = this.editorRef.textarea();
    const entry = this.toc.entries().find((e) => e.id === id);
    if (!textarea || !entry) {
      return;
    }
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(entry.offset, entry.offset);
    textarea.scrollTop = Math.max(0, this.measureLineTop(textarea, entry.offset) - 8);
    this.syncHighlightScroll();
  }

  private measureLineTop(textarea: HTMLTextAreaElement, offset: number): number {
    void textarea;
    const highlight = this.highlightEl()?.nativeElement;
    if (!highlight || offset <= 0) {
      return 0;
    }
    const walker = document.createTreeWalker(highlight, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const length = node.textContent?.length ?? 0;
      if (remaining > length) {
        remaining -= length;
        continue;
      }
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, remaining);
      const line = range.getClientRects()[0];
      if (!line) {
        return 0;
      }
      const pre = highlight.getBoundingClientRect();
      return line.top - pre.top + highlight.scrollTop;
    }
    return 0;
  }

  private syncHighlightScroll(): void {
    const input = this.inputEl()?.nativeElement;
    if (!input) {
      return;
    }
    const highlight = this.highlightEl()?.nativeElement;
    if (highlight) {
      highlight.scrollTop = input.scrollTop;
      highlight.scrollLeft = input.scrollLeft;
    }
    const searchLayer = this.searchEl()?.nativeElement;
    if (searchLayer) {
      searchLayer.scrollTop = input.scrollTop;
      searchLayer.scrollLeft = input.scrollLeft;
    }
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.document.setContent(target.value);
  }

  protected onDragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types;
    if (!types || !Array.from(types).includes('Files')) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(event: DragEvent): void {
    const files = Array.from(event.dataTransfer?.files ?? []).filter(
      (file) => file.type.startsWith('image/') || isImagePath(file.name),
    );
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    if (!this.claimDrop()) {
      return;
    }
    void this.document.importImageFiles(files);
  }

  protected onScroll(event: Event): void {
    this.syncHighlightScroll();
    const input = event.target as HTMLTextAreaElement;
    this.session.captureScroll({ editor: scrollRatio(input) });
  }

  protected onPreviewScroll(event: Event): void {
    const preview = event.target as HTMLElement;
    this.session.captureScroll({ preview: scrollRatio(preview) });
  }

  @HostListener('click', ['$event'])
  protected onPreviewClick(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement;
    const copy = target.closest('.code-copy') as HTMLElement | null;
    if (copy) {
      this.copyCode(copy);
      return;
    }
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (anchor && this.openLink(anchor)) {
      event.preventDefault();
    }
  }

  @HostListener('keydown', ['$event'])
  protected onPreviewKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const target = event.target as HTMLElement;
    const copy = target.closest('.code-copy') as HTMLElement | null;
    if (copy) {
      event.preventDefault();
      this.copyCode(copy);
      return;
    }
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (anchor) {
      event.preventDefault();
      this.openLink(anchor);
    }
  }

  private openLink(anchor: HTMLAnchorElement): boolean {
    const href = anchor.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) {
      return false;
    }
    void openUrl(href).catch(() => {});
    return true;
  }

  private copyCode(copy: HTMLElement): void {
    const codeEl = copy.closest('.code-block')?.querySelector('pre code');
    const code = codeEl?.textContent ?? '';
    if (code === '') {
      return;
    }
    void writeText(code).then(() => this.showCopied(copy));
  }

  private showCopied(copy: HTMLElement): void {
    const label = copy.querySelector('.code-copy-label');
    if (!label) {
      return;
    }
    label.textContent = this.i18n.t('code.copied');
    setTimeout(() => {
      label.textContent = this.i18n.t('code.copy');
    }, 1600);
  }
}
