import { Marked, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import csharp from 'highlight.js/lib/languages/csharp';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import ruby from 'highlight.js/lib/languages/ruby';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { escapeHtml } from './markdown-highlight';

// Seulement les langages courants : le bundle reste raisonnable et les
// grammaires exotiques retombent sur du texte échappé.
const LANGUAGES = {
  bash,
  c,
  cpp,
  css,
  csharp,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  plaintext,
  ruby,
  python,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [name, grammar] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, grammar);
}

/** Au-delà, on n'essaie plus de colorer : l'aperçu doit rester fluide. */
const MAX_HIGHLIGHT_LENGTH = 100_000;

export interface RenderMarkdownOptions {
  /** Affiche une gouttière de numéros devant chaque ligne de code. */
  lineNumbers?: boolean;
}

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

/**
 * Nettoie l'info string d'un fence (` ```ts `) : on ne garde que le premier
 * mot et les caractères autorisés dans un nom de langage.
 */
function normalizeLanguage(lang: string | undefined): string {
  const first = (lang ?? '').trim().split(/\s+/)[0] ?? '';
  return first.replace(/[^a-zA-Z0-9_+#.-]/g, '').toLowerCase();
}

function stripTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/**
 * Colore le code avec highlight.js. Le texte est toujours échappé : les blocs
 * contenant du HTML ne sont donc jamais interprétés.
 */
function highlightCode(code: string, language: string): string {
  if (!language || !hljs.getLanguage(language) || code.length > MAX_HIGHLIGHT_LENGTH) {
    return escapeHtml(code);
  }
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/** Palette du PDF : `html-to-pdfmake` ignore les classes CSS, d'où l'inline. */
const PDF_COLORS: Record<string, string> = {
  'hljs-keyword': '#cf222e',
  'hljs-doctag': '#cf222e',
  'hljs-template-tag': '#cf222e',
  'hljs-template-variable': '#cf222e',
  'hljs-type': '#953800',
  'hljs-title': '#8250df',
  'hljs-section': '#0550ae',
  'hljs-attr': '#0550ae',
  'hljs-attribute': '#0550ae',
  'hljs-literal': '#0550ae',
  'hljs-number': '#0550ae',
  'hljs-operator': '#0550ae',
  'hljs-variable': '#953800',
  'hljs-selector-attr': '#0550ae',
  'hljs-selector-class': '#0550ae',
  'hljs-selector-id': '#0550ae',
  'hljs-string': '#0a3069',
  'hljs-regexp': '#0a3069',
  'hljs-built_in': '#953800',
  'hljs-symbol': '#953800',
  'hljs-comment': '#6e7781',
  'hljs-quote': '#6e7781',
  'hljs-formula': '#6e7781',
  'hljs-name': '#116329',
  'hljs-selector-tag': '#116329',
  'hljs-selector-pseudo': '#116329',
  'hljs-meta': '#6e7781',
  'hljs-bullet': '#0550ae',
  'hljs-addition': '#116329',
  'hljs-deletion': '#82071e',
};

function highlightCodeForPdf(code: string, language: string): string {
  return highlightCode(code, language).replace(
    /<span class="([^"]*)">/g,
    (_match, classes: string) => {
      const token = classes.split(/\s+/).find((name) => name in PDF_COLORS);
      return token ? `<span style="color:${PDF_COLORS[token]}">` : '<span>';
    },
  );
}

function lineNumbersGutter(code: string): string {
  const count = code === '' ? 0 : code.split('\n').length;
  let numbers = '';
  for (let index = 1; index <= count; index++) {
    numbers += `<span>${index}</span>`;
  }
  return `<div class="code-block-gutter" aria-hidden="true">${numbers}</div>`;
}

function createParser(options: RenderMarkdownOptions): Marked {
  return new Marked({
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
        const language = normalizeLanguage(lang);
        const code = stripTrailingNewline(text);
        const highlighted = highlightCode(code, language);
        const classAttr = language ? ` class="hljs language-${language}"` : ' class="hljs"';
        const codeHtml = `<pre><code${classAttr}>${highlighted}</code></pre>`;
        const body = options.lineNumbers
          ? `<div class="code-block-body">${lineNumbersGutter(code)}${codeHtml}</div>`
          : codeHtml;
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
          body +
          '</div>'
        );
      },
    },
  });
}

const parserCache = new Map<boolean, Marked>();

function parserFor(lineNumbers: boolean): Marked {
  let parser = parserCache.get(lineNumbers);
  if (!parser) {
    parser = createParser({ lineNumbers });
    parserCache.set(lineNumbers, parser);
  }
  return parser;
}

const parser = createParser({});

const pdfParser = new Marked({
  gfm: true,
  async: false,
  renderer: {
    code({ text, lang }) {
      const language = normalizeLanguage(lang);
      const code = stripTrailingNewline(text);
      const highlighted = highlightCodeForPdf(code, language);
      const classAttr = language ? ` class="language-${language}"` : '';
      return `<pre><code${classAttr}>${highlighted}</code></pre>`;
    },
  },
});

export const CODE_BLOCK_RENDER_PLACEHOLDER = '__MARKIFY_COPY_LABEL__';

export function renderMarkdown(
  content: string,
  copyLabel: string,
  options: RenderMarkdownOptions = {},
): string {
  if (!content) {
    return '';
  }
  const escapedLabel = escapeHtml(copyLabel);
  slugCounts.clear();
  const html = parserFor(options.lineNumbers === true).parse(content) as string;
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
  return pdfParser.parse(content) as string;
}
