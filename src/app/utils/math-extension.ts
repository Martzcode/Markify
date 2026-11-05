import type { TokenizerAndRendererExtension, Tokens } from 'marked';

export interface MathToken extends Tokens.Generic {
  type: 'mathInline' | 'mathBlock';
  /** Contenu TeX, sans les délimiteurs. */
  text: string;
  /** Vrai pour `$$…$$` et `\[…\]` : la formule est centrée sur sa ligne. */
  displayMode: boolean;
}

export type MathTokenRenderer = (token: MathToken) => string;

/**
 * `$…$` : le délimiteur fermant doit être suivi d'une espace, d'une
 * ponctuation ou de la fin du texte. Sans cette contrainte, `$5 et $10`
 * serait interprété comme une formule.
 */
const INLINE_DOLLAR = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:;)}\])'"]|$)/;
const INLINE_PAREN = /^\\\(((?:\\.|[^\\\n])*?)\\\)/;
const INLINE_BRACKET = /^\\\[((?:\\[^]|[^\\])*?)\\\]/;

const BLOCK_DOLLAR = /^(\${1,2})[ \t]*\n((?:\\[^]|[^\\])+?)\n[ \t]*\1[ \t]*(?:\n|$)/;
const BLOCK_BRACKET = /^\\\[((?:\\[^]|[^\\])+?)\\\][ \t]*(?:\n|$)/;

function inlineToken(raw: string, text: string, displayMode: boolean): MathToken | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  return { type: 'mathInline', raw, text: trimmed, displayMode };
}

function blockToken(raw: string, text: string): MathToken | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  return { type: 'mathBlock', raw, text: trimmed, displayMode: true };
}

/**
 * Indique à marked où se trouve la prochaine formule potentielle. Sans cela,
 * le tokenizer de texte consommerait `$` comme un caractère ordinaire et ne
 * laisserait jamais l'extension examine la formule.
 */
function findInlineMath(src: string): number | undefined {
  for (let index = 0; index < src.length; index++) {
    const char = src[index];
    if (char === '$') {
      if (INLINE_DOLLAR.test(src.slice(index))) {
        return index;
      }
      while (src[index + 1] === '$') {
        index++;
      }
    } else if (char === '\\' && (src[index + 1] === '(' || src[index + 1] === '[')) {
      const rest = src.slice(index);
      if (INLINE_PAREN.test(rest) || INLINE_BRACKET.test(rest)) {
        return index;
      }
      index++;
    }
  }
  return undefined;
}

/**
 * Reconnaît les formules TeX avant que Markdown ne transforme leur contenu.
 *
 * Le moteur KaTeX n'est pas importé ici : le tokenizer ne produit qu'un
 * emplacement que l'aperçu hydrate après coup. L'export PDF reçoit la source
 * TeX, car `html-to-pdfmake` ne sait pas mettre en page le HTML de KaTeX.
 */
export function createMathExtension(
  render: MathTokenRenderer,
): TokenizerAndRendererExtension[] {
  return [
    {
      name: 'mathBlock',
      level: 'block',
      tokenizer(src) {
        const dollars = BLOCK_DOLLAR.exec(src);
        if (dollars) {
          return blockToken(dollars[0], dollars[2]);
        }
        const brackets = BLOCK_BRACKET.exec(src);
        if (brackets) {
          return blockToken(brackets[0], brackets[1]);
        }
        return undefined;
      },
      renderer(token) {
        return render(token as MathToken);
      },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start: findInlineMath,
      tokenizer(src) {
        const dollars = INLINE_DOLLAR.exec(src);
        if (dollars) {
          return inlineToken(dollars[0], dollars[2], dollars[1].length === 2);
        }
        const parens = INLINE_PAREN.exec(src);
        if (parens) {
          return inlineToken(parens[0], parens[1], false);
        }
        const brackets = INLINE_BRACKET.exec(src);
        if (brackets) {
          return inlineToken(brackets[0], brackets[1], true);
        }
        return undefined;
      },
      renderer(token) {
        return render(token as MathToken);
      },
    },
  ];
}
