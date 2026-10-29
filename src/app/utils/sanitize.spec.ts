import { sanitizePdfHtml, sanitizePreviewHtml } from './sanitize';

describe('sanitizePreviewHtml', () => {
  it('removes scripts, iframes and event handlers', () => {
    const html =
      '<p onclick="steal()">a</p><script>alert(1)</script>' +
      '<iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)">';

    const result = sanitizePreviewHtml(html);

    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onclick');
    expect(result).toContain('<p>a</p>');
    expect(result).toContain('<img src="x">');
  });

  it('drops javascript: links but keeps safe and relative ones', () => {
    const result = sanitizePreviewHtml(
      '<a href="javascript:alert(1)">bad</a>' +
        '<a href="https://example.com">good</a>' +
        '<a href="#anchor">anchor</a>',
    );

    expect(result).toContain('<a>bad</a>');
    expect(result).toContain('<a href="https://example.com">good</a>');
    expect(result).toContain('<a href="#anchor">anchor</a>');
  });

  it('keeps heading ids that match a document property', () => {
    expect(sanitizePreviewHtml('<h1 id="title">Title</h1>')).toContain('id="title"');
  });

  it('keeps the copy button and the syntax highlighting classes', () => {
    const html =
      '<div class="code-block"><span class="code-copy" role="button" tabindex="0" title="Copier">' +
      '<span class="code-copy-label">Copier</span></span>' +
      '<pre><code class="hljs language-ts"><span class="hljs-keyword">const</span></code></pre></div>';

    const result = sanitizePreviewHtml(html);

    expect(result).toContain('class="code-copy"');
    expect(result).toContain('role="button"');
    expect(result).toContain('tabindex="0"');
    expect(result).toContain('class="hljs language-ts"');
    expect(result).toContain('class="hljs-keyword"');
  });

  it('drops style attributes so CSS cannot load remote resources', () => {
    const result = sanitizePreviewHtml(
      '<div style="background:url(https://evil.example/pixel)">x</div>',
    );

    expect(result).toBe('<div>x</div>');
  });

  it('keeps data: images but drops local file sources', () => {
    const result = sanitizePreviewHtml(
      '<img src="data:image/png;base64,AAAA">' + '<img src="file:///etc/passwd">',
    );

    expect(result).toContain('src="data:image/png;base64,AAAA"');
    expect(result).not.toContain('file:');
  });
});

describe('sanitizePdfHtml', () => {
  it('keeps the inline colours used by the PDF pipeline', () => {
    const result = sanitizePdfHtml(
      '<pre><code><span style="color:#cf222e">const</span> x</code></pre>',
    );

    expect(result).toContain('style="color:#cf222e"');
  });

  it('still removes active content and event handlers', () => {
    const result = sanitizePdfHtml(
      '<p onclick="x">a</p><script>alert(1)</script><iframe src="https://evil"></iframe>',
    );

    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('onclick');
    expect(result).toContain('<p>a</p>');
  });
});
