import { describe, expect, it } from 'vitest';
import { extractHeadings, renderMarkdown, renderMarkdownPlain } from './markdown-render';

/** Texte visible d'un fragment HTML (hors en-tête et gouttière). */
function codeText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return parsed.querySelector('pre code')?.textContent ?? '';
}

describe('renderMarkdown', () => {
  it('wraps fenced code blocks with a header and a copy button', () => {
    const html = renderMarkdown('```ts\nconst x = 1;\n```', 'Copy');
    expect(html).toContain('class="code-block"');
    expect(html).toContain('class="code-block-header"');
    expect(html).toContain('class="code-block-lang">ts</span>');
    expect(html).toContain('class="code-copy"');
    expect(codeText(html)).toBe('const x = 1;');
  });

  it('replaces the copy label placeholder throughout', () => {
    const html = renderMarkdown('```\ncode\n```', 'Kopieren');
    expect(html).toContain('>Kopieren</span>');
    expect(html).not.toContain('__MARKIFY_COPY_LABEL__');
  });

  it('leaves plain markdown rendering intact', () => {
    const html = renderMarkdown('**bold** and [link](https://example.com)', 'Copy');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://example.com" title="https://example.com">link</a>');
  });

  it('keeps inline formatting inside link text', () => {
    const html = renderMarkdown('[**bold**](https://example.com)', 'Copy');
    expect(html).toContain(
      '<a href="https://example.com" title="https://example.com"><strong>bold</strong></a>',
    );
  });

  it('escapes href and exposes it as the tooltip title', () => {
    const html = renderMarkdown('[x](https://example.com/a?q=1&r=2)', 'Copy');
    expect(html).toContain('title="https://example.com/a?q=1&amp;r=2"');
  });

  it('returns an empty string for empty content', () => {
    expect(renderMarkdown('', 'Copy')).toBe('');
  });

  it('adds anchor ids to headings', () => {
    const html = renderMarkdown('# Introduction\n\n## Getting Started', 'Copy');
    expect(html).toContain('<h1 id="introduction">Introduction</h1>');
    expect(html).toContain('<h2 id="getting-started">Getting Started</h2>');
  });

  it('deduplicates heading ids', () => {
    const html = renderMarkdown('# Title\n\n# Title', 'Copy');
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain('<h1 id="title-1">Title</h1>');
  });

  it('highlights a known language with highlight.js tokens', () => {
    const html = renderMarkdown('```ts\nconst answer: number = 42;\n```', 'Copy');

    expect(html).toContain('class="hljs language-ts"');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('hljs-number');
  });

  it('normalizes the fence language and ignores extra info', () => {
    const html = renderMarkdown('```JS title="demo"\nconst x = 1;\n```', 'Copy');

    expect(html).toContain('class="code-block-lang">js</span>');
    expect(html).toContain('class="hljs language-js"');
  });

  it('escapes code blocks instead of injecting their HTML', () => {
    const html = renderMarkdown('```html\n<div onclick="alert(1)">x</div>\n```', 'Copy');

    expect(html).toContain('&lt;');
    expect(html).not.toContain('<div onclick');
    expect(codeText(html)).toBe('<div onclick="alert(1)">x</div>');
  });

  it('falls back to escaped text for an unknown language', () => {
    const html = renderMarkdown('```nope\n<tag> a && b\n```', 'Copy');

    expect(html).toContain('class="hljs language-nope"');
    expect(html).toContain('&lt;tag&gt; a &amp;&amp; b');
    expect(codeText(html)).toBe('<tag> a && b');
  });

  it('keeps the copy button and the exact source text', () => {
    const html = renderMarkdown('```python\ndef f(x):\n    return x < 3\n```', 'Copier');

    expect(html).toContain('class="code-copy"');
    expect(html).toContain('>Copier</span>');
    expect(codeText(html)).toBe('def f(x):\n    return x < 3');
  });

  it('omits line numbers by default', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\nconst b = 2;\n```', 'Copy');

    expect(html).not.toContain('code-block-gutter');
    expect(html).not.toContain('code-block-body');
  });

  it('adds a gutter with one number per code line when enabled', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\nconst b = 2;\n```', 'Copy', {
      lineNumbers: true,
    });

    expect(html).toContain('class="code-block-gutter"');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const numbers = Array.from(
      parsed.querySelectorAll('.code-block-gutter span'),
      (span) => span.textContent,
    );
    expect(numbers).toEqual(['1', '2']);
    expect(codeText(html)).toBe('const a = 1;\nconst b = 2;');
  });
});

describe('renderMarkdownPlain', () => {
  it('colors code blocks with inline styles for the PDF pipeline', () => {
    const html = renderMarkdownPlain('```ts\nconst x = 1;\n```');

    expect(html).toContain('style="color:#cf222e"');
    expect(html).toContain('const');
    expect(html).not.toContain('hljs-');
  });

  it('escapes code blocks in the PDF rendering too', () => {
    const html = renderMarkdownPlain('```html\n<script>x</script>\n```');

    expect(html).toContain('&lt;');
    expect(html).not.toContain('<script>');
  });

  it('returns an empty string for empty content', () => {
    expect(renderMarkdownPlain('')).toBe('');
  });
});

describe('extractHeadings', () => {
  it('extracts headings in document order with positions', () => {
    const content = '# Intro\n\nSome text\n\n## Section\n\n### Sub\n';
    const entries = extractHeadings(content);
    expect(entries).toEqual([
      { id: 'intro', text: 'Intro', level: 1, offset: content.indexOf('# Intro') },
      { id: 'section', text: 'Section', level: 2, offset: content.indexOf('## Section') },
      { id: 'sub', text: 'Sub', level: 3, offset: content.indexOf('### Sub') },
    ]);
  });

  it('produces ids matching the rendered anchors', () => {
    const content = '# Ma Carte\n\n# Ma Carte\n';
    const entries = extractHeadings(content);
    const html = renderMarkdown(content, 'Copy');
    for (const entry of entries) {
      expect(html).toContain(`id="${entry.id}"`);
    }
  });

  it('returns an empty array for empty content', () => {
    expect(extractHeadings('')).toEqual([]);
  });
});
