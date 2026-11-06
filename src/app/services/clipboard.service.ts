import { Injectable, inject } from '@angular/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { I18nService } from '../i18n/i18n.service';
import { stripFrontMatter } from '../utils/front-matter';
import { htmlToPlainText } from '../utils/html-to-text';
import { renderMarkdownPlain } from '../utils/markdown-render';
import { DocumentService } from './document.service';
import { EditorRefService } from './editor-ref.service';
import { SecurityService } from './security.service';
import { ToastService } from './toast.service';

export type CopyFormat = 'html' | 'markdown' | 'text';

const TOAST_KEYS: Record<CopyFormat, 'toast.copiedHtml' | 'toast.copiedMarkdown' | 'toast.copiedText'> = {
  html: 'toast.copiedHtml',
  markdown: 'toast.copiedMarkdown',
  text: 'toast.copiedText',
};

/**
 * Copie le document (ou la sélection du `textarea`) dans le presse-papiers
 * (F-30) : HTML riche, Markdown source ou texte brut.
 *
 * Le HTML passe par le rendu assaini utilisé pour le PDF, puis par
 * `navigator.clipboard.write` avec un `ClipboardItem` bicolore : les
 * applications qui comprennent le HTML riche (traitement de texte, messagerie)
 * gardent la mise en forme, les autres reçoivent le texte brut.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly document = inject(DocumentService);
  private readonly editorRef = inject(EditorRefService);
  private readonly i18n = inject(I18nService);
  private readonly security = inject(SecurityService);
  private readonly toast = inject(ToastService);

  async copyAs(format: CopyFormat): Promise<boolean> {
    if (!this.document.isOpen()) {
      return false;
    }
    const source = this.source();
    try {
      switch (format) {
        case 'markdown':
          await writeText(source);
          break;
        case 'text':
          await writeText(this.plainText(source));
          break;
        case 'html':
          await this.writeRichHtml(source);
          break;
      }
      this.toast.show(this.i18n.t(TOAST_KEYS[format]));
      return true;
    } catch {
      this.toast.show(this.i18n.t('toast.copyFailed'));
      return false;
    }
  }

  /** Sélection du `textarea` si elle existe, sinon tout le document. */
  private source(): string {
    const textarea = this.editorRef.textarea();
    if (textarea) {
      const { selectionStart, selectionEnd } = textarea;
      if (selectionStart !== selectionEnd) {
        return textarea.value.slice(selectionStart, selectionEnd);
      }
    }
    return this.document.content();
  }

  private plainText(source: string): string {
    return htmlToPlainText(
      renderMarkdownPlain(stripFrontMatter(source), {
        allowRawHtml: this.security.allowRawHtml(),
      }),
    );
  }

  private async writeRichHtml(source: string): Promise<void> {
    const html = renderMarkdownPlain(stripFrontMatter(source), {
      allowRawHtml: this.security.allowRawHtml(),
    });
    const plain = htmlToPlainText(html);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      throw new Error('Rich clipboard unavailable');
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  }
}
