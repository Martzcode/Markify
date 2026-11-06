import { JSON_SCHEMA, dump, load } from 'js-yaml/browser';

/** Propriétés d'en-tête YAML d'un document Markdown. */
export type FrontMatter = Record<string, unknown>;

/** Emplacement du bloc `--- … ---` au début d'un document. */
interface FrontMatterBlock {
  /** Contenu YAML entre les délimiteurs, sans les lignes de délimitation. */
  yaml: string;
  /** Texte qui suit le bloc, inchangé. */
  body: string;
  /** Position du corps dans le document d'origine. */
  bodyStart: number;
  /** Fin de ligne utilisé par le document (`\n` ou `\r\n`). */
  lineBreak: string;
  /** BOM éventuel, conservé lors d'une réécriture. */
  bom: string;
}

export interface FrontMatterResult {
  /** Un bloc délimité par `---` existe au début du document. */
  exists: boolean;
  /**
   * Le bloc est un mapping YAML valide : il peut être affiché et édité. Un
   * bloc vide ou uniquement composé de commentaires est considéré comme vide.
   */
  present: boolean;
  data: FrontMatter;
  /** Document sans son en-tête lorsque `present` est vrai. */
  body: string;
  /** Position du corps dans le document d'origine (0 si l'en-tête est absent). */
  bodyStart: number;
  /** Message de validation lorsque le bloc existe mais n'est pas exploitable. */
  error: string | null;
  lineBreak: string;
  bom: string;
}

interface ApplyFrontMatterOptions {
  /** Conserve un bloc vide au lieu de supprimer l'en-tête. */
  force?: boolean;
}

const OPENING = /^(?:\uFEFF)?---[ \t]*\r?\n/;
const CLOSING = /^(?:---|\.\.\.)[ \t]*$/;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Vrai si le bloc ne contient ni valeur ni clé (espaces et commentaires). */
function isEmptyYaml(yaml: string): boolean {
  return yaml
    .split(/\r?\n/)
    .every((line) => line.trim() === '' || line.trimStart().startsWith('#'));
}

/** Fin de ligne dominant du document, utilisé pour un nouvel en-tête. */
function detectLineBreak(content: string): string {
  const index = content.indexOf('\n');
  return index > 0 && content[index - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * Repère un bloc YAML au tout début du document. La fermeture doit être une
 * ligne ne contenant que `---` ou `...`. Le corps n'est pas recopié : il est
 * seulement référencé, ce qui garantit qu'une modification des propriétés ne
 * touche pas au texte du document.
 */
function locateBlock(content: string): FrontMatterBlock | null {
  const opening = OPENING.exec(content);
  if (!opening) {
    return null;
  }
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const lineBreak = opening[0].includes('\r\n') ? '\r\n' : '\n';
  const yamlLines: string[] = [];
  let index = opening[0].length;

  while (index <= content.length) {
    const lineEnd = content.indexOf('\n', index);
    const rawLine = lineEnd === -1 ? content.slice(index) : content.slice(index, lineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (CLOSING.test(line)) {
      return {
        yaml: yamlLines.join(lineBreak),
        body: lineEnd === -1 ? '' : content.slice(lineEnd + 1),
        bodyStart: lineEnd === -1 ? content.length : lineEnd + 1,
        lineBreak,
        bom,
      };
    }
    yamlLines.push(line);
    if (lineEnd === -1) {
      break;
    }
    index = lineEnd + 1;
  }
  return null;
}

/**
 * Analyse l'en-tête YAML d'un document Markdown.
 *
 * Un bloc qui n'est pas un mapping (chaîne, liste, YAML invalide) n'est pas
 * considéré comme un en-tête : le document reste affiché tel quel et le panneau
 * signale l'erreur. Cela évite de masquer un document qui commencerait par une
 * règle horizontale suivie d'une autre.
 */
export function parseFrontMatter(content: string): FrontMatterResult {
  const block = locateBlock(content);
  if (!block) {
    return {
      exists: false,
      present: false,
      data: {},
      body: content,
      bodyStart: 0,
      error: null,
      lineBreak: '\n',
      bom: '',
    };
  }

  let value: unknown;
  try {
    // js-yaml 5 refuse un document vide : un bloc ne contenant que des
    // espaces ou des commentaires représente un mapping vide.
    value = isEmptyYaml(block.yaml) ? {} : load(block.yaml, { schema: JSON_SCHEMA });
  } catch (error) {
    return {
      exists: true,
      present: false,
      data: {},
      body: content,
      bodyStart: 0,
      error: messageOf(error),
      lineBreak: block.lineBreak,
      bom: block.bom,
    };
  }

  if (value === undefined || value === null) {
    value = {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      exists: true,
      present: false,
      data: {},
      body: content,
      bodyStart: 0,
      error: 'Front matter must be a YAML mapping.',
      lineBreak: block.lineBreak,
      bom: block.bom,
    };
  }

  return {
    exists: true,
    present: true,
    data: value as FrontMatter,
    body: block.body,
    bodyStart: block.bodyStart,
    error: null,
    lineBreak: block.lineBreak,
    bom: block.bom,
  };
}

/** Contenu du document sans son en-tête YAML valide. */
export function stripFrontMatter(content: string): string {
  const parsed = parseFrontMatter(content);
  return parsed.present ? parsed.body : content;
}

/** Sérialise un mapping en bloc d'en-tête YAML. */
export function serializeFrontMatter(data: FrontMatter, lineBreak = '\n'): string {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return `---${lineBreak}---${lineBreak}`;
  }
  const yaml = dump(Object.fromEntries(entries), {
    schema: JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
  return `---${lineBreak}${yaml}${lineBreak}---${lineBreak}`;
}

/**
 * Réécrit uniquement l'en-tête YAML. Le corps est repris à l'identique.
 * Sans propriété, le bloc est supprimé, sauf si `force` demande de conserver un
 * bloc vide (bouton « Ajouter des propriétés »).
 */
export function applyFrontMatter(
  content: string,
  data: FrontMatter,
  options: ApplyFrontMatterOptions = {},
): string {
  const parsed = parseFrontMatter(content);
  const block = locateBlock(content);
  const keepEmpty = options.force === true;
  const hasFields = Object.keys(data).some((key) => data[key] !== undefined);

  if (parsed.exists && !parsed.present) {
    throw new Error('Cannot rewrite invalid front matter.');
  }

  if (!hasFields && !keepEmpty) {
    return parsed.present ? parsed.bom + parsed.body : content;
  }

  const serialized = serializeFrontMatter(data, block?.lineBreak ?? detectLineBreak(content));
  if (block) {
    return block.bom + serialized + block.body;
  }

  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? content.slice(1) : content;
  return bom + serialized + body;
}
