import { describe, expect, it } from 'vitest';
import { extractHeadings, renderMarkdown } from './markdown-render';

describe('renderMarkdown', () => {
  it('wraps fenced code blocks with a header and a copy button', () => {
    const html = renderMarkdown('```ts\nconst x = 1;\n```', 'Copy');
    expect(html).toContain('class="code-block"');
    expect(html).toContain('class="code-block-header"');
    expect(html).toContain('class="code-block-lang">ts</span>');
    expect(html).toContain('class="code-copy"');
    expect(html).toContain('const x = 1;');
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
    expect(html).toContain('<a href="https://example.com" title="https://example.com"><strong>bold</strong></a>');
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
