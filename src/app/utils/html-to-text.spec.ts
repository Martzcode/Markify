import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './html-to-text';

describe('htmlToPlainText', () => {
  it('returns an empty string for empty input', () => {
    expect(htmlToPlainText('')).toBe('');
  });

  it('separates block elements with blank lines', () => {
    expect(htmlToPlainText('<h1>Title</h1><p>Hello <strong>world</strong>.</p>')).toBe(
      'Title\n\nHello world.',
    );
  });

  it('keeps inline elements on the same line', () => {
    expect(htmlToPlainText('<p>Hello <em>dear</em> friend.</p>')).toBe('Hello dear friend.');
  });

  it('renders list items with a leading dash', () => {
    expect(htmlToPlainText('<ul><li>One</li><li>Two</li></ul>')).toBe('- One\n- Two');
  });

  it('keeps code blocks verbatim', () => {
    expect(htmlToPlainText('<pre><code>const x = 1;\nconst y = 2;</code></pre>')).toBe(
      'const x = 1;\nconst y = 2;',
    );
  });

  it('separates table cells with tabs', () => {
    expect(
      htmlToPlainText('<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>'),
    ).toBe('A\tB\n1\t2');
  });

  it('uses image alternative text', () => {
    expect(htmlToPlainText('<p>Logo: <img src="logo.png" alt="Markify"></p>')).toBe(
      'Logo: Markify',
    );
  });

  it('turns line breaks into new lines', () => {
    expect(htmlToPlainText('<p>First<br>Second</p>')).toBe('First\nSecond');
  });

  it('drops scripts and styles', () => {
    expect(htmlToPlainText('<p>Text</p><script>alert(1)</script><style>p{}</style>')).toBe(
      'Text',
    );
  });

  it('collapses superfluous whitespace', () => {
    expect(htmlToPlainText('<p>Hello\n\n\n   world</p>')).toBe('Hello world');
  });

  it('renders a horizontal rule as a blank separation', () => {
    expect(htmlToPlainText('<p>Before</p><hr><p>After</p>')).toBe('Before\n\nAfter');
  });
});
