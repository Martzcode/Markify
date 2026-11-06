import { describe, expect, it } from 'vitest';
import {
  applyFrontMatter,
  parseFrontMatter,
  serializeFrontMatter,
  stripFrontMatter,
} from './front-matter';

describe('parseFrontMatter', () => {
  it('reports no header for a plain document', () => {
    const result = parseFrontMatter('# Title\n\nBody.');

    expect(result.exists).toBe(false);
    expect(result.present).toBe(false);
    expect(result.data).toEqual({});
    expect(result.body).toBe('# Title\n\nBody.');
    expect(result.bodyStart).toBe(0);
    expect(result.error).toBeNull();
  });

  it('parses a YAML mapping and keeps the body untouched', () => {
    const content = '---\ntitle: Hello\ntags:\n  - one\n  - two\n---\n# Title\n\nBody.\n';
    const result = parseFrontMatter(content);

    expect(result.exists).toBe(true);
    expect(result.present).toBe(true);
    expect(result.data).toEqual({ title: 'Hello', tags: ['one', 'two'] });
    expect(result.body).toBe('# Title\n\nBody.\n');
    expect(content.slice(result.bodyStart)).toBe(result.body);
    expect(result.error).toBeNull();
  });

  it('keeps dates as strings instead of turning them into Date objects', () => {
    const result = parseFrontMatter('---\ndate: 2026-11-06\n---\nBody');

    expect(result.data['date']).toBe('2026-11-06');
    expect(typeof result.data['date']).toBe('string');
  });

  it('accepts CRLF documents and preserves the line break style', () => {
    const result = parseFrontMatter('---\r\ntitle: Hello\r\n---\r\nBody\r\n');

    expect(result.present).toBe(true);
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.body).toBe('Body\r\n');
    expect(result.lineBreak).toBe('\r\n');
  });

  it('treats an empty block as an empty header', () => {
    const result = parseFrontMatter('---\n---\nBody');

    expect(result.exists).toBe(true);
    expect(result.present).toBe(true);
    expect(result.data).toEqual({});
    expect(result.body).toBe('Body');
  });

  it('accepts a closing line made of dots', () => {
    const result = parseFrontMatter('---\ntitle: Hello\n...\nBody');

    expect(result.present).toBe(true);
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.body).toBe('Body');
  });

  it('ignores a horizontal rule that is not a complete header', () => {
    const result = parseFrontMatter('---\n\nBody\n');

    expect(result.exists).toBe(false);
    expect(result.present).toBe(false);
    expect(result.body).toBe('---\n\nBody\n');
  });

  it('reports invalid YAML and leaves the document intact', () => {
    const content = '---\ntitle: [broken\n---\nBody';
    const result = parseFrontMatter(content);

    expect(result.exists).toBe(true);
    expect(result.present).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.body).toBe(content);
  });

  it('rejects a YAML sequence at the top level', () => {
    const result = parseFrontMatter('---\n- one\n- two\n---\nBody');

    expect(result.exists).toBe(true);
    expect(result.present).toBe(false);
    expect(result.error).toContain('mapping');
  });

  it('does not strip a later block that is not at the start', () => {
    const content = '# Title\n\n---\ntitle: Hello\n---\n';
    const result = parseFrontMatter(content);

    expect(result.present).toBe(false);
    expect(result.body).toBe(content);
  });
});

describe('stripFrontMatter', () => {
  it('removes a valid header', () => {
    expect(stripFrontMatter('---\ntitle: Hello\n---\n# Body')).toBe('# Body');
  });

  it('leaves a document without a header unchanged', () => {
    expect(stripFrontMatter('# Body')).toBe('# Body');
  });

  it('leaves an invalid header in place', () => {
    const content = '---\ntitle: [broken\n---\n# Body';
    expect(stripFrontMatter(content)).toBe(content);
  });
});

describe('serializeFrontMatter', () => {
  it('serializes a mapping between delimiters', () => {
    expect(serializeFrontMatter({ title: 'Hello', tags: ['a'] })).toBe(
      '---\ntitle: Hello\ntags:\n  - a\n---\n',
    );
  });

  it('keeps an empty block when there are no fields', () => {
    expect(serializeFrontMatter({})).toBe('---\n---\n');
  });
});

describe('applyFrontMatter', () => {
  it('adds a header to a document without one', () => {
    const result = applyFrontMatter('# Body\n', { title: 'Hello' });

    expect(result).toBe('---\ntitle: Hello\n---\n# Body\n');
  });

  it('uses the document line endings when adding a header', () => {
    const result = applyFrontMatter('# Body\r\n', { title: 'Hello' });

    expect(result).toBe('---\r\ntitle: Hello\r\n---\r\n# Body\r\n');
  });

  it('rewrites only the header and preserves the body', () => {
    const content = '---\ntitle: Old\nauthor: Ada\n---\n# Body\n\nText.\n';
    const result = applyFrontMatter(content, { title: 'New', author: 'Ada' });

    expect(result).toContain('title: New');
    expect(result).not.toContain('title: Old');
    expect(result.endsWith('# Body\n\nText.\n')).toBe(true);
    expect(parseFrontMatter(result).body).toBe('# Body\n\nText.\n');
  });

  it('removes the header when there are no fields', () => {
    expect(applyFrontMatter('---\ntitle: Hello\n---\n# Body', {})).toBe('# Body');
  });

  it('keeps an empty header when forced', () => {
    expect(applyFrontMatter('# Body', {}, { force: true })).toBe('---\n---\n# Body');
  });

  it('preserves CRLF line endings', () => {
    const result = applyFrontMatter('---\r\ntitle: Old\r\n---\r\nBody\r\n', { title: 'New' });

    expect(result).toBe('---\r\ntitle: New\r\n---\r\nBody\r\n');
  });

  it('preserves a byte-order mark', () => {
    const result = applyFrontMatter('\uFEFF---\ntitle: Old\n---\nBody', { title: 'New' });

    expect(result.startsWith('\uFEFF---\ntitle: New')).toBe(true);
    expect(result.endsWith('\nBody')).toBe(true);
  });

  it('refuses to rewrite an invalid header', () => {
    expect(() => applyFrontMatter('---\ntitle: [broken\n---\nBody', { title: 'New' })).toThrow(
      'Cannot rewrite invalid front matter.',
    );
  });
});
