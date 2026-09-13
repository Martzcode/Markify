import { describe, expect, it } from 'vitest';
import { renderMarkdown, extractHeadings } from '../../utils/markdown-render';

describe('TOC id coherence', () => {
  it('rendered heading ids equal extracted ids for same content', () => {
    const content =
      '# Intro\n\ntext\n\n## Sous titre\n\n### Deep\n\n## Sous titre\n\n# Intro\n\n# Finale';
    const html = renderMarkdown(content, 'copier');
    const entries = extractHeadings(content);
    const htmlIds = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(entries.map((e) => e.id)).toEqual(htmlIds);
    expect(htmlIds.length).toBe(entries.length);
  });
});
