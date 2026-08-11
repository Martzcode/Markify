import { describe, expect, it } from 'vitest';
import { highlightMarkdown } from './markdown-highlight';

describe('highlightMarkdown', () => {
  it('highlights headings with a colored marker', () => {
    const html = highlightMarkdown('# Title');
    expect(html).toContain('<span class="syn-punct">#</span>');
    expect(html).toContain('<span class="syn-heading">');
  });

  it('highlights fenced code blocks', () => {
    const html = highlightMarkdown('```ts\nconst x = 1;\n```');
    expect(html).toContain('<span class="syn-code-block">');
    expect(html).toContain('<span class="syn-code">ts</span>');
    expect(html).toContain('const x = 1;');
  });

  it('escapes html inside code blocks', () => {
    const html = highlightMarkdown('```\n<div>\n```');
    expect(html).toContain('&lt;div&gt;');
    expect(html).not.toContain('<div>');
  });

  it('highlights inline code', () => {
    const html = highlightMarkdown('use `marked`');
    expect(html).toContain('<span class="syn-code">');
    expect(html).toContain('<span class="syn-punct">`</span>');
  });

  it('highlights bold and italic', () => {
    const html = highlightMarkdown('**bold** and *italic*');
    expect(html).toContain('<span class="syn-strong">');
    expect(html).toContain('<span class="syn-em">');
  });

  it('highlights links and their url', () => {
    const html = highlightMarkdown('[site](https://example.com)');
    expect(html).toContain('<span class="syn-punct">[</span>');
    expect(html).toContain('<span class="syn-link">https://example.com</span>');
    expect(html).toContain('site');
  });

  it('highlights images', () => {
    const html = highlightMarkdown('![alt](img.png)');
    expect(html).toContain('<span class="syn-punct">!</span>');
    expect(html).toContain('<span class="syn-link">img.png</span>');
  });

  it('highlights blockquotes', () => {
    const html = highlightMarkdown('> a quote');
    expect(html).toContain('<span class="syn-blockquote">');
    expect(html).toContain('a quote');
  });

  it('highlights list markers', () => {
    const html = highlightMarkdown('- item\n1. done');
    expect(html).toContain('<span class="syn-punct">-</span>');
    expect(html).toContain('<span class="syn-punct">1.</span>');
  });

  it('highlights task list items', () => {
    const html = highlightMarkdown('- [ ] todo\n- [x] done');
    expect(html).toContain('<span class="syn-task-pending">[ ]</span>');
    expect(html).toContain('<span class="syn-task-done">[x]</span>');
  });

  it('highlights horizontal rules', () => {
    const html = highlightMarkdown('---');
    expect(html).toContain('<span class="syn-hr">');
  });

  it('highlights tables', () => {
    const html = highlightMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<span class="syn-punct">|</span>');
    expect(html).toContain('<span class="syn-heading"> a </span>');
  });

  it('escapes raw html', () => {
    const html = highlightMarkdown('<b>hi</b>');
    expect(html).toContain('&lt;b&gt;');
  });
});
