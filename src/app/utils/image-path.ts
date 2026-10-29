/**
 * Extensions reconnues pour les images locales. La liste reste volontairement
 * limitée aux formats que la WebView sait afficher et que l'export PDF gère.
 */
const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

/** Retire une éventuelle query string ou ancre d'une URL de fichier. */
function stripQueryAndHash(value: string): string {
  const index = value.search(/[?#]/);
  return index === -1 ? value : value.slice(0, index);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}

/**
 * Transforme une URL `file://` en chemin exploitable. Les URL `file:///C:/…`
 * produites par les navigateurs Windows perdent leur slash initial.
 */
function stripFileScheme(value: string): string {
  if (!/^file:/i.test(value)) {
    return value;
  }
  let path = value.replace(/^file:(\/\/)?/i, '');
  if (path.startsWith('/') && /^\/[A-Za-z]:\//.test(path)) {
    path = path.slice(1);
  }
  return path;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value);
}

/**
 * Normalise les séparateurs et les segments `.` / `..`. Les chemins absolus ne
 * peuvent pas remonter au-dessus de leur racine ; les chemins relatifs
 * conservent leurs `..` pour que la vérification de confinement les rejette.
 */
function normalizePath(value: string): string {
  const slashed = toSlashes(value);
  const unc = slashed.startsWith('//');
  const drive = /^([A-Za-z]:)/.exec(slashed)?.[1] ?? '';
  const rest = drive ? slashed.slice(drive.length) : slashed;
  const absolute = rest.startsWith('/');
  const segments = rest.split('/');
  const output: string[] = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (output.length > 0 && output[output.length - 1] !== '..') {
        output.pop();
      } else if (!absolute) {
        output.push('..');
      }
      continue;
    }
    output.push(segment);
  }

  const joined = output.join('/');
  if (drive) {
    return `${drive}/${joined}`;
  }
  if (unc) {
    return `//${joined}`;
  }
  return absolute ? `/${joined}` : joined;
}

/** Vrai si `target` se trouve dans `base` (ou est `base` lui-même). */
function isWithin(base: string, target: string): boolean {
  const normalizeCase = (value: string) => (/^[A-Za-z]:/.test(value) ? value.toLowerCase() : value);
  const normalizedBase = normalizeCase(normalizePath(base));
  const normalizedTarget = normalizeCase(normalizePath(target));
  const prefix = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(prefix);
}

/** Vrai si le chemin se termine par une extension d'image connue. */
export function isImagePath(path: string): boolean {
  const clean = stripQueryAndHash(path.trim());
  const name = clean.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Nom de fichier sans dossier ni extension, utilisé comme texte alternatif. */
export function imageAltFromPath(path: string): string {
  const clean = stripQueryAndHash(path.trim());
  const name = clean.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Dossier contenant un document, ou `null` si le chemin n'en a pas. */
export function documentDirectory(documentPath: string | null): string | null {
  if (!documentPath) {
    return null;
  }
  const slashed = toSlashes(documentPath);
  const index = slashed.lastIndexOf('/');
  if (index === -1) {
    return null;
  }
  if (index === 0) {
    return '/';
  }
  const dir = slashed.slice(0, index);
  return /^[A-Za-z]:$/.test(dir) ? `${dir}/` : dir;
}

/**
 * Résout une source d'image locale (relative, absolue ou `file://`) par rapport
 * au dossier du document. Retourne `null` si le chemin sort de ce dossier ou
 * s'il ne s'agit pas d'une image.
 */
export function resolveLocalImagePath(src: string, documentPath: string | null): string | null {
  const trimmed = src.trim();
  if (!trimmed) {
    return null;
  }

  const clean = stripQueryAndHash(decodePath(stripFileScheme(trimmed)));
  if (!clean || !isImagePath(clean)) {
    return null;
  }

  // Un schéma autre qu'un lecteur Windows n'est pas un chemin local.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(clean) && !/^[A-Za-z]:[\\/]/.test(clean)) {
    return null;
  }

  const absolute = isAbsolutePath(toSlashes(clean));
  const dir = documentDirectory(documentPath);
  if (!absolute && !dir) {
    return null;
  }

  const joined = absolute ? clean : dir?.endsWith('/') ? `${dir}${clean}` : `${dir}/${clean}`;
  const normalized = normalizePath(joined);
  if (dir && !isWithin(dir, normalized)) {
    return null;
  }
  return normalized;
}
