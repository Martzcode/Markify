import { Marked } from 'marked';
import { escapeHtml } from './markdown-highlight';

export interface CodeBlockRenderOptions {
  copyLabel: string;
}

const parser = new Marked({
  gfm: true,
  async: false,
  renderer: {
    code({ text, lang }) {
      const language = lang ? escapeHtml(lang) : '';
      return (
        '<div class="code-block">' +
        '<div class="code-block-header">' +
        `<span class="code-block-lang">${language}</span>` +
        '<span class="code-copy" role="button" tabindex="0" title="' +
        '__MARKIFY_COPY_LABEL__">' +
        '<span class="code-copy-icon" aria-hidden="true"></span>' +
        '<span class="code-copy-label">__MARKIFY_COPY_LABEL__</span>' +
        '</span>' +
        '</div>' +
        `<pre><code${language ? ` class="language-${language}"` : ''}>${text}</code></pre>` +
        '</div>'
      );
    },
  },
});

export const CODE_BLOCK_RENDER_PLACEHOLDER = '__MARKIFY_COPY_LABEL__';

export function renderMarkdown(content: string, copyLabel: string): string {
  if (!content) {
    return '';
  }
  const escapedLabel = escapeHtml(copyLabel);
  const html = parser.parse(content) as string;
  return html.replaceAll(CODE_BLOCK_RENDER_PLACEHOLDER, escapedLabel);
}
