import { escapeHtml } from './markdown-highlight';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  start: number;
  end: number;
  /** Groupes capturés par l'expression régulière (vide en mode littéral). */
  groups: string[];
}

export interface SearchResult {
  matches: SearchMatch[];
  /** Vrai si la requête n'est pas une expression régulière valide. */
  invalid: boolean;
}

/** Au-delà, on cesse d'énumérer : garde-fou contre les motifs pathologiques. */
const MAX_MATCHES = 20000;

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Trouve toutes les occurrences de `query` dans `source`.
 *
 * La recherche porte toujours sur le texte source (c'est lui que le
 * remplacement modifie). En mode littéral, la requête est échappée ; en mode
 * expression régulière, elle est utilisée telle quelle. Le drapeau `u` est
 * activé pour que `\p{...}` fonctionne et que les frontières de mot gèrent
 * les lettres accentuées.
 */
export function findMatches(source: string, query: string, options: SearchOptions): SearchResult {
  if (query === '') {
    return { matches: [], invalid: false };
  }
  let regex: RegExp;
  try {
    const pattern = options.regex ? query : escapeRegExp(query);
    regex = new RegExp(pattern, options.caseSensitive ? 'gu' : 'giu');
  } catch {
    return { matches: [], invalid: true };
  }

  const matches: SearchMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0].length === 0) {
      // Un motif qui peut correspondre à vide (ex. `a*`) boucherait la boucle.
      regex.lastIndex += 1;
      continue;
    }
    if (options.wholeWord) {
      const before = start > 0 ? source[start - 1] : '';
      const after = end < source.length ? source[end] : '';
      if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) {
        continue;
      }
    }
    matches.push({ start, end, groups: match.slice(1).map((group) => group ?? '') });
    if (matches.length >= MAX_MATCHES) {
      break;
    }
  }
  return { matches, invalid: false };
}

/**
 * Développe les références de remplacement d'une expression régulière :
 * `$$`, `$&` et `$1`…`$9`. Les autres séquences sont laissées telles quelles.
 */
export function expandReplacement(template: string, matched: string, groups: string[]): string {
  let out = '';
  for (let i = 0; i < template.length; i++) {
    const char = template[i];
    if (char !== '$' || i === template.length - 1) {
      out += char;
      continue;
    }
    const next = template[i + 1];
    if (next === '$') {
      out += '$';
      i++;
    } else if (next === '&') {
      out += matched;
      i++;
    } else if (next >= '1' && next <= '9') {
      out += groups[Number(next) - 1] ?? '';
      i++;
    } else {
      out += char;
    }
  }
  return out;
}

/** Remplace une occurrence unique et renvoie le nouveau contenu. */
export function replaceMatch(
  source: string,
  match: SearchMatch,
  replacement: string,
  options: SearchOptions,
): string {
  const text = options.regex
    ? expandReplacement(replacement, source.slice(match.start, match.end), match.groups)
    : replacement;
  return source.slice(0, match.start) + text + source.slice(match.end);
}

/** Remplace toutes les occurrences en une seule passe. */
export function replaceAllMatches(
  source: string,
  matches: SearchMatch[],
  replacement: string,
  options: SearchOptions,
): string {
  let out = '';
  let cursor = 0;
  for (const match of matches) {
    out += source.slice(cursor, match.start);
    out += options.regex
      ? expandReplacement(replacement, source.slice(match.start, match.end), match.groups)
      : replacement;
    cursor = match.end;
  }
  return out + source.slice(cursor);
}

/**
 * Construit le HTML de la couche de surlignage de l'éditeur : le texte source
 * échappé, avec des `<mark>` sur les occurrences. Le texte reste invisible
 * (la couche ne sert qu'à peindre les fonds derrière le `textarea`).
 */
export function renderSearchLayer(
  source: string,
  matches: SearchMatch[],
  currentIndex: number,
): string {
  if (source === '' || matches.length === 0) {
    return escapeHtml(source);
  }
  let html = '';
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start < cursor) {
      return;
    }
    html += escapeHtml(source.slice(cursor, match.start));
    const className = index === currentIndex ? 'search-hit search-hit-current' : 'search-hit';
    html += `<mark class="${className}">${escapeHtml(source.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  });
  return html + escapeHtml(source.slice(cursor));
}

/**
 * Surligne les occurrences dans le HTML déjà rendu de l'aperçu.
 *
 * La recherche est appliquée à chaque nœud texte : le compteur reste basé sur
 * la source, mais le rendu peut fusionner ou transformer du texte (entités,
 * liens), d'où un surlignage « au mieux ». Les balises et attributs ne sont
 * jamais touchés.
 */
export function highlightRenderedHtml(html: string, query: string, options: SearchOptions): string {
  if (query === '') {
    return html;
  }
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // La gouttière des numéros de ligne n'appartient pas au code : on ne la
    // surligne pas et le compteur reste cohérent avec la source.
    if (node.parentElement?.closest('.code-block-gutter')) {
      continue;
    }
    nodes.push(node);
  }

  for (const node of nodes) {
    const { matches, invalid } = findMatches(node.data, query, options);
    if (invalid || matches.length === 0) {
      continue;
    }
    const fragment = parsed.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.appendChild(parsed.createTextNode(node.data.slice(cursor, match.start)));
      const mark = parsed.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = node.data.slice(match.start, match.end);
      fragment.appendChild(mark);
      cursor = match.end;
    }
    fragment.appendChild(parsed.createTextNode(node.data.slice(cursor)));
    node.parentNode?.replaceChild(fragment, node);
  }

  return parsed.body.innerHTML;
}
