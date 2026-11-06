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

  it('renders mermaid fences as a diagram placeholder without a code header', () => {
    const content = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```';
    const html = renderMarkdown(content, 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const block = parsed.querySelector('.mermaid-block');

    expect(block).not.toBeNull();
    expect(block!.querySelector('.code-block')).toBeNull();
    expect(block!.querySelector('.code-copy')).toBeNull();
    expect(block!.querySelector('.mermaid-source')?.textContent).toBe(
      'graph TD\n  A[Start] --> B[End]',
    );
    expect(block!.querySelector('.mermaid-diagram')?.getAttribute('role')).toBe('img');
  });

  it('escapes mermaid source instead of injecting it', () => {
    const html = renderMarkdown(
      '```mermaid\ngraph TD\n  A[<img src=x onerror=alert(1)>] --> B\n```',
      'Copy',
    );

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('renderMarkdown math', () => {
  it('renders inline math as a placeholder with its TeX source', () => {
    const html = renderMarkdown('Energy $E=mc^2$ is famous', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const math = parsed.querySelector('.math-inline');

    expect(math).not.toBeNull();
    expect(math!.textContent).toBe('E=mc^2');
    expect(math!.getAttribute('role')).toBe('math');
  });

  it('renders a block formula from a dollar fence', () => {
    const html = renderMarkdown('$$\nE=mc^2\n$$', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const math = parsed.querySelector('.math-block');

    expect(math).not.toBeNull();
    expect(math!.tagName).toBe('DIV');
    expect(math!.textContent).toBe('E=mc^2');
  });

  it('treats a one-line double-dollar formula as display math', () => {
    const html = renderMarkdown('Before $$E=mc^2$$ after', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const math = parsed.querySelector('.math-block');

    expect(math).not.toBeNull();
    expect(math!.tagName).toBe('SPAN');
    expect(math!.textContent).toBe('E=mc^2');
  });

  it('supports the LaTeX parenthesis and bracket delimiters', () => {
    const html = renderMarkdown('Inline \\(a+b\\) then\n\n\\[c+d\\]', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('.math-inline')?.textContent).toBe('a+b');
    expect(parsed.querySelector('.math-block')?.textContent).toBe('c+d');
  });

  it('renders math inside headings', () => {
    const html = renderMarkdown('# Formula $x^2$', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('h1 .math-inline')?.textContent).toBe('x^2');
  });

  it('does not interpret math inside code spans or fences', () => {
    const html = renderMarkdown('Use `$x$` here.\n\n```ts\nconst price = $y$;\n```', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('.math-inline')).toBeNull();
    expect(parsed.querySelector('.math-block')).toBeNull();
    expect(parsed.querySelector('pre code')?.textContent).toContain('$y$');
  });

  it('leaves escaped dollars as literal text', () => {
    const html = renderMarkdown('Escaped \\$x\\$ here', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('.math-inline')).toBeNull();
    expect(parsed.body.textContent).toContain('$x$');
  });

  it('does not mistake prices for formulas', () => {
    const html = renderMarkdown('It costs $5 and $10.', 'Copy');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('.math-inline')).toBeNull();
    expect(parsed.body.textContent).toContain('$5 and $10');
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

  it('escapes raw HTML by default', () => {
    const html = renderMarkdownPlain('<img src="x" onerror="alert(1)">');

    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('sanitizes raw HTML when allowed but keeps inline colours', () => {
    const html = renderMarkdownPlain(
      '<img src="x" onerror="alert(1)">\n\n```ts\nconst x = 1;\n```',
      { allowRawHtml: true },
    );

    expect(html).toContain('<img src="x">');
    expect(html).not.toContain('onerror');
    expect(html).toContain('style="color:#cf222e"');
  });

  it('returns an empty string for empty content', () => {
    expect(renderMarkdownPlain('')).toBe('');
  });

  it('keeps mermaid fences as plain code instead of executing them', () => {
    const html = renderMarkdownPlain('```mermaid\ngraph TD\n  A --> B\n```');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('.mermaid-block')).toBeNull();
    expect(parsed.querySelector('pre code')?.textContent).toBe('graph TD\n  A --> B');
    expect(parsed.querySelector('pre code')?.className).toBe('language-mermaid');
  });

  it('keeps the TeX source instead of KaTeX markup in the PDF', () => {
    const html = renderMarkdownPlain('Inline $E=mc^2$ and\n\n$$\na^2+b^2=c^2\n$$');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.querySelector('.math-inline')).toBeNull();
    expect(parsed.querySelector('.math-block')).toBeNull();
    expect(parsed.body.textContent).toContain('$E=mc^2$');
    expect(parsed.body.textContent).toContain('a^2+b^2=c^2');
  });
});

describe('renderMarkdown images', () => {
  it('rewrites image sources through the resolver after sanitization', () => {
    const html = renderMarkdown('![photo](./assets/photo.png)', 'Copy', {
      resolveImageSrc: (src) =>
        src === './assets/photo.png' ? 'asset://localhost/photo.png' : null,
    });

    expect(html).toContain('src="asset://localhost/photo.png"');
    expect(html).toContain('alt="photo"');
    expect(html).not.toContain('__MARKIFY_IMAGE_');
  });

  it('removes images rejected by the resolver', () => {
    const html = renderMarkdown('![secret](../secret.png)', 'Copy', {
      resolveImageSrc: () => null,
    });

    expect(html).not.toContain('<img');
  });

  it('resolves raw HTML images before the sanitizer strips their path', () => {
    const html = renderMarkdown('<img src="C:\\images\\photo.png" onerror="alert(1)">', 'Copy', {
      allowRawHtml: true,
      resolveImageSrc: (src) =>
        src === 'C:\\images\\photo.png' ? 'asset://localhost/photo.png' : null,
    });

    expect(html).toContain('src="asset://localhost/photo.png"');
    expect(html).not.toContain('onerror');
  });

  it('leaves images untouched when no resolver is provided', () => {
    const html = renderMarkdown('![photo](./assets/photo.png)', 'Copy');

    expect(html).toContain('src="./assets/photo.png"');
  });
});

describe('renderMarkdown security', () => {
  it('escapes raw HTML by default', () => {
    const html = renderMarkdown('<div onclick="steal()">hi</div>', 'Copy');

    expect(html).toContain('&lt;div');
    expect(html).not.toContain('<div onclick');
  });

  it('renders sanitized raw HTML when the option is enabled', () => {
    const html = renderMarkdown(
      '<img src="x" onerror="alert(1)"><script>alert(2)</script>',
      'Copy',
      { allowRawHtml: true },
    );

    expect(html).toContain('<img src="x">');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('neutralises unsafe link schemes', () => {
    const html = renderMarkdown('[bad](javascript:alert(1)) and [ok](https://example.com)', 'Copy');

    expect(html).toContain('bad and');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('javascript:');
  });

  it('keeps heading ids that collide with document properties', () => {
    const html = renderMarkdown('# Title', 'Copy');

    expect(html).toContain('<h1 id="title">Title</h1>');
  });

  it('still strips active tags when raw HTML is allowed', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>', 'Copy', {
      allowRawHtml: true,
    });

    expect(html).not.toContain('<iframe');
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

  it('ignores the front matter but keeps offsets relative to the whole document', () => {
    const content = '---\ntitle: Hello\ntags:\n  - one\n---\n# Intro\n\n## Section\n';
    const entries = extractHeadings(content);

    expect(entries).toEqual([
      { id: 'intro', text: 'Intro', level: 1, offset: content.indexOf('# Intro') },
      { id: 'section', text: 'Section', level: 2, offset: content.indexOf('## Section') },
    ]);
  });

  it('does not treat an invalid front matter as a header', () => {
    const content = '---\n- one\n- two\n---\n# Intro\n';
    const entries = extractHeadings(content);

    expect(entries).toEqual([
      { id: 'intro', text: 'Intro', level: 1, offset: content.indexOf('# Intro') },
    ]);
  });
});

describe('renderMarkdown front matter', () => {
  it('removes a valid front matter from the preview', () => {
    const html = renderMarkdown('---\ntitle: Hello\ntags: [one]\n---\n# Body', 'Copy');

    expect(html).toContain('<h1 id="body">Body</h1>');
    expect(html).not.toContain('title: Hello');
    expect(html).not.toContain('tags:');
  });

  it('keeps an invalid front matter visible', () => {
    const html = renderMarkdown('---\ntitle: [broken\n---\n# Body', 'Copy');

    expect(html).toContain('title: [broken');
    expect(html).toContain('<h1 id="body">Body</h1>');
  });

  it('removes the front matter from the PDF rendering too', () => {
    const html = renderMarkdownPlain('---\ntitle: Hello\n---\n# Body');

    expect(html).toContain('<h1>Body</h1>');
    expect(html).not.toContain('title: Hello');
  });

  it('does not run KaTeX on the front matter in the PDF rendering', () => {
    const html = renderMarkdownPlain('---\nformula: $x^2$\n---\n# Body');

    expect(html).not.toContain('formula');
    expect(html).toContain('<h1>Body</h1>');
  });
});
