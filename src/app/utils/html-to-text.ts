const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'ul',
]);

function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style') {
    return '';
  }
  if (tag === 'br') {
    return '\n';
  }
  if (tag === 'img') {
    return element.getAttribute('alt') ?? '';
  }
  if (tag === 'pre') {
    return `\n${element.textContent ?? ''}\n`;
  }
  if (tag === 'hr') {
    return '\n';
  }
  const inner = Array.from(element.childNodes, textOf).join('');
  if (tag === 'li') {
    return `- ${inner.trim()}\n`;
  }
  if (tag === 'td' || tag === 'th') {
    return `${inner.trim()}\t`;
  }
  if (tag === 'tr') {
    return `${inner.trim()}\n`;
  }
  if (BLOCK_TAGS.has(tag)) {
    return `\n${inner.trim()}\n\n`;
  }
  return inner;
}

/** Convertit le HTML produit par `renderMarkdownPlain` en texte lisible. */
export function htmlToPlainText(html: string): string {
  if (!html) {
    return '';
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return textOf(parsed.body)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
