import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown-render';

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
    expect(html).toContain('href="https://example.com"');
  });

  it('returns an empty string for empty content', () => {
    expect(renderMarkdown('', 'Copy')).toBe('');
  });
});
