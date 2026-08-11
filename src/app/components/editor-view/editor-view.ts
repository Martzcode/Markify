import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { marked } from 'marked';
import { DocumentService } from '../../services/document.service';
import { EditorRefService } from '../../services/editor-ref.service';
import { highlightMarkdown } from '../../utils/markdown-highlight';

@Component({
  selector: 'app-editor-view',
  templateUrl: './editor-view.html',
  styleUrl: './editor-view.css',
})
export class EditorView {
  protected readonly document = inject(DocumentService);
  private readonly editorRef = inject(EditorRefService);
  private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly highlightEl = viewChild<ElementRef<HTMLElement>>('highlight');

  protected readonly renderedHtml = computed(() => {
    const content = this.document.content();
    return content ? marked.parse(content, { async: false }) : '';
  });

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
}
