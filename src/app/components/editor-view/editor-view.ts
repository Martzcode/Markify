import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { marked } from 'marked';
import { DocumentService } from '../../services/document.service';
import { EditorRefService } from '../../services/editor-ref.service';

@Component({
  selector: 'app-editor-view',
  templateUrl: './editor-view.html',
  styleUrl: './editor-view.css',
})
export class EditorView {
  protected readonly document = inject(DocumentService);
  private readonly editorRef = inject(EditorRefService);
  private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  protected readonly renderedHtml = computed(() => {
    const content = this.document.content();
    return content ? marked.parse(content, { async: false }) : '';
  });

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
}
