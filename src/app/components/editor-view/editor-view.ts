import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { DocumentService } from '../../services/document.service';
import { EditorRefService } from '../../services/editor-ref.service';
import { I18nService } from '../../i18n/i18n.service';
import { TocService } from '../../services/toc.service';
import { highlightMarkdown } from '../../utils/markdown-highlight';
import { renderMarkdown } from '../../utils/markdown-render';

@Component({
  selector: 'app-editor-view',
  templateUrl: './editor-view.html',
  styleUrl: './editor-view.css',
})
export class EditorView {
  protected readonly document = inject(DocumentService);
  private readonly editorRef = inject(EditorRefService);
  private readonly i18n = inject(I18nService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toc = inject(TocService);
  private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly highlightEl = viewChild<ElementRef<HTMLElement>>('highlight');
  private readonly previewEl = viewChild<ElementRef<HTMLElement>>('preview');

  protected readonly renderedHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      renderMarkdown(this.document.content(), this.i18n.t('code.copy')),
    ),
  );

  protected readonly highlightedHtml = computed(() =>
    this.document.content() ? highlightMarkdown(this.document.content()) : '',
  );

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
    const highlight = this.highlightEl()?.nativeElement;
    if (input && highlight) {
      highlight.scrollTop = input.scrollTop;
      highlight.scrollLeft = input.scrollLeft;
    }
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.document.setContent(target.value);
  }

  protected onScroll(): void {
    this.syncHighlightScroll();
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
