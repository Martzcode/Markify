import { Component, computed, inject } from '@angular/core';
import { marked } from 'marked';
import { DocumentService } from '../../services/document.service';

@Component({
  selector: 'app-editor-view',
  templateUrl: './editor-view.html',
  styleUrl: './editor-view.css',
})
export class EditorView {
  protected readonly document = inject(DocumentService);

  protected readonly renderedHtml = computed(() => {
    const content = this.document.content();
    return content ? marked.parse(content, { async: false }) : '';
  });

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.document.setContent(target.value);
  }
}
