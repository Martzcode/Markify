import DOMPurify from 'dompurify';

/**
 * Balises produites par le rendu Markdown, plus quelques balises HTML
 * courantes qu'un auteur peut légitimement utiliser.
 */
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'span',
  'div',
  'a',
  'img',
  'strong',
  'em',
  'del',
  's',
  'u',
  'mark',
  'sup',
  'sub',
  'kbd',
  'abbr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'input',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
];

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'id',
  'class',
  'role',
  'tabindex',
  'type',
  'checked',
  'disabled',
  'align',
  'start',
  'colspan',
  'rowspan',
  'lang',
  'dir',
  'open',
];

/**
 * Assainit le HTML de l'aperçu avant `bypassSecurityTrustHtml`.
 *
 * Les gestionnaires d'événements (`on*`), les balises actives et les schémas
 * dangereux (`javascript:`, `data:` hors images) sont retirés par DOMPurify.
 * Les attributs `style` sont interdits : ils permettraient de charger des
 * ressources distantes via `background-image`.
 *
 * `SANITIZE_DOM` est désactivé car DOMPurify supprime les `id` qui portent le
 * nom d'une propriété de `document` (par exemple `title`), ce qui casserait
 * les ancres des titres et la table des matières. L'application n'utilise pas
 * d'accès par nom (`window[id]`), le risque de clobbering reste donc nul.
 */
export function sanitizePreviewHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: false,
  });
}

/**
 * Assainit le HTML destiné au PDF. Même liste blanche que l'aperçu, mais les
 * styles inline sont conservés : `html-to-pdfmake` ignore les classes CSS et
 * s'appuie dessus pour les couleurs des blocs de code.
 */
export function sanitizePdfHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [...ALLOWED_ATTR, 'style'],
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: false,
  });
}
