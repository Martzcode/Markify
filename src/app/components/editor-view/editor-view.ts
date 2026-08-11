import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { DocumentService } from '../../services/document.service';
import { EditorRefService } from '../../services/editor-ref.service';
import { I18nService } from '../../i18n/i18n.service';
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
  private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly highlightEl = viewChild<ElementRef<HTMLElement>>('highlight');

  protected readonly renderedHtml = computed(() =>
    renderMarkdown(this.document.content(), this.i18n.t('code.copy')),
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
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.document.setContent(target.value);
  }

  protected onScroll(): void {
    const input = this.inputEl()?.nativeElement;
    const highlight = this.highlightEl()?.nativeElement;
    if (input && highlight) {
      highlight.scrollTop = input.scrollTop;
      highlight.scrollLeft = input.scrollLeft;
    }
  }

  @HostListener('click', ['$event'])
  protected onPreviewClick(event: MouseEvent): void {
    const copy = (event.target as HTMLElement).closest('.code-copy') as HTMLElement | null;
    if (copy) {
      this.copyCode(copy);
    }
  }

  @HostListener('keydown', ['$event'])
  protected onPreviewKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const copy = (event.target as HTMLElement).closest('.code-copy') as HTMLElement | null;
    if (copy) {
      event.preventDefault();
      this.copyCode(copy);
    }
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
