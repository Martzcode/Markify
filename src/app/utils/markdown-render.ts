import { Marked, type Tokens } from 'marked';
import { escapeHtml } from './markdown-highlight';

export interface CodeBlockRenderOptions {
  copyLabel: string;
}

export interface HeadingEntry {
  id: string;
  text: string;
  level: number;
  offset: number;
}

const slugCounts = new Map<string, number>();

function nextHeadingId(raw: string): string {
  const base =
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-') || 'section';
  const count = slugCounts.get(base) ?? 0;
  slugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function headingText(token: Tokens.Heading): string {
  return (token.tokens ?? [])
    .map((inline) => {
      const t = inline as Tokens.Generic;
      return typeof t['text'] === 'string' ? t['text'] : '';
    })
    .join('')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

const parser = new Marked({
  gfm: true,
  async: false,
  renderer: {
    heading(token) {
      return `<h${token.depth} id="${nextHeadingId(token.raw)}">${token.text}</h${token.depth}>`;
    },
    link(token: Tokens.Link) {
      const href = token.href ?? '';
      const text = this.parser.parseInline(token.tokens);
      return `<a href="${escapeHtml(href)}" title="${escapeHtml(href)}">${text}</a>`;
    },
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

const plainParser = new Marked({ gfm: true, async: false });

export const CODE_BLOCK_RENDER_PLACEHOLDER = '__MARKIFY_COPY_LABEL__';

export function renderMarkdown(content: string, copyLabel: string): string {
  if (!content) {
    return '';
  }
  const escapedLabel = escapeHtml(copyLabel);
  slugCounts.clear();
  const html = parser.parse(content) as string;
  return html.replaceAll(CODE_BLOCK_RENDER_PLACEHOLDER, escapedLabel);
}

export function extractHeadings(content: string): HeadingEntry[] {
  if (!content) {
    return [];
  }
  slugCounts.clear();
  const headings: HeadingEntry[] = [];
  let cursor = 0;
  for (const token of parser.lexer(content)) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      const offset = content.indexOf(heading.raw, cursor);
      if (offset >= 0) {
        cursor = offset + heading.raw.length;
      }
      headings.push({
        id: nextHeadingId(heading.raw),
        text: headingText(heading),
        level: heading.depth,
        offset,
      });
    }
  }
  return headings;
}

export function renderMarkdownPlain(content: string): string {
  if (!content) {
    return '';
  }
  return plainParser.parse(content) as string;
}
