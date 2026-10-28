import { renderMarkdown } from './markdown-render';
import {
  expandReplacement,
  findMatches,
  highlightRenderedHtml,
  renderSearchLayer,
  replaceAllMatches,
  replaceMatch,
  type SearchOptions,
} from './search';

const literal: SearchOptions = { caseSensitive: false, wholeWord: false, regex: false };

describe('findMatches', () => {
  it('finds every occurrence, ignoring case by default', () => {
    const { matches, invalid } = findMatches('One two one ONE', 'one', literal);

    expect(invalid).toBe(false);
    expect(matches.map((m) => m.start)).toEqual([0, 8, 12]);
  });

  it('respects case when requested', () => {
    const { matches } = findMatches('One two one ONE', 'one', {
      ...literal,
      caseSensitive: true,
    });

    expect(matches.map((m) => m.start)).toEqual([8]);
  });

  it('matches whole words only', () => {
    const { matches } = findMatches('cat concatenate cat.', 'cat', {
      ...literal,
      wholeWord: true,
    });

    expect(matches.map((m) => m.start)).toEqual([0, 16]);
  });

  it('treats accented letters as word characters', () => {
    const { matches } = findMatches('un été, caféine et café', 'café', {
      ...literal,
      wholeWord: true,
    });

    expect(matches.map((m) => m.start)).toEqual([19]);
  });

  it('supports regular expressions and captures groups', () => {
    const { matches } = findMatches('John Doe, Jane Roe', '(\\w+) (\\w+)', {
      ...literal,
      regex: true,
    });

    expect(matches).toHaveLength(2);
    expect(matches[0].groups).toEqual(['John', 'Doe']);
    expect(matches[1].groups).toEqual(['Jane', 'Roe']);
  });

  it('reports an invalid regular expression', () => {
    const { matches, invalid } = findMatches('abc', '([', { ...literal, regex: true });

    expect(invalid).toBe(true);
    expect(matches).toEqual([]);
  });

  it('ignores zero-length matches instead of looping forever', () => {
    const { matches } = findMatches('abc', 'x*', { ...literal, regex: true });

    expect(matches).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatches('abc', '', literal)).toEqual({ matches: [], invalid: false });
  });
});

describe('expandReplacement', () => {
  it('expands $$, $& and numbered groups', () => {
    expect(expandReplacement('$1-$2 $$ $&', 'ab', ['a', 'b'])).toBe('a-b $ ab');
  });

  it('leaves unknown references untouched', () => {
    expect(expandReplacement('$9 $x', 'ab', [])).toBe(' $x');
  });
});

describe('replaceMatch', () => {
  it('inserts a literal replacement without expanding $ references', () => {
    const source = 'price: 10';
    const [match] = findMatches(source, '10', literal).matches;

    expect(replaceMatch(source, match, '$1€', literal)).toBe('price: $1€');
  });

  it('expands regular expression groups', () => {
    const source = 'John Doe';
    const [match] = findMatches(source, '(\\w+) (\\w+)', { ...literal, regex: true }).matches;

    expect(replaceMatch(source, match, '$2 $1', { ...literal, regex: true })).toBe('Doe John');
  });
});

describe('replaceAllMatches', () => {
  it('replaces every occurrence in one pass', () => {
    const source = 'a a a';
    const { matches } = findMatches(source, 'a', literal);

    expect(replaceAllMatches(source, matches, 'bb', literal)).toBe('bb bb bb');
  });

  it('keeps the untouched text around matches', () => {
    const source = 'one, two, one!';
    const { matches } = findMatches(source, 'one', literal);

    expect(replaceAllMatches(source, matches, '1', literal)).toBe('1, two, 1!');
  });
});

describe('renderSearchLayer', () => {
  it('escapes the source and marks the current occurrence', () => {
    const source = '<one> one';
    const { matches } = findMatches(source, 'one', literal);

    const html = renderSearchLayer(source, matches, 1);

    expect(html).toContain('&lt;');
    expect(html).toContain('<mark class="search-hit">one</mark>');
    expect(html).toContain('<mark class="search-hit search-hit-current">one</mark>');
  });

  it('returns the escaped source when there is no match', () => {
    expect(renderSearchLayer('a < b', [], 0)).toBe('a &lt; b');
  });
});

describe('highlightRenderedHtml', () => {
  it('wraps occurrences in the rendered text', () => {
    const html = '<h1 id="title">Title</h1><p>some title here</p>';

    const result = highlightRenderedHtml(html, 'title', literal);

    expect(result).toContain('<h1 id="title"><mark class="search-hit">Title</mark></h1>');
    expect(result).toContain('<mark class="search-hit">title</mark> here');
  });

  it('never touches tag names or attribute values', () => {
    const html = '<h1 id="title">Body</h1>';

    const result = highlightRenderedHtml(html, 'h1', literal);

    expect(result).toBe(html);
  });

  it('returns the html untouched for an empty query', () => {
    const html = '<p>text</p>';

    expect(highlightRenderedHtml(html, '', literal)).toBe(html);
  });

  it('preserves the rendered structure of code blocks and headings', () => {
    const html = renderMarkdown('# Title\n\n```ts\nconst one = 1;\n```', 'Copy');

    const result = highlightRenderedHtml(html, 'one', literal);

    expect(result).toContain('class="code-block"');
    expect(result).toContain('id="title"');
    expect(result).toContain('<mark class="search-hit">one</mark>');
  });
});
