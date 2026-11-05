import type { MermaidTheme } from '../services/mermaid.service';

export interface MermaidBlockOptions {
  theme: MermaidTheme;
  /** Rend la source Mermaid en SVG (injecté tel quel après assainissement). */
  render: (source: string, theme: MermaidTheme) => Promise<string>;
  errorTitle: string;
  diagramLabel: string;
  /** Permet d'abandonner un rendu devenu obsolète (contenu ou thème changé). */
  isCancelled?: () => boolean;
}

const MAX_ERROR_DETAIL_LENGTH = 500;

/**
 * Remplace les blocs Mermaid de l'aperçu par leur diagramme.
 *
 * La source est lue dans le DOM (elle a déjà été échappée par le rendu
 * Markdown) et le SVG retourné par Mermaid est inséré directement : Mermaid le
 * nettoie lui-même avec DOMPurify en mode `strict`. Les blocs sont traités
 * séquentiellement pour ne pas saturer le thread pendant la frappe.
 */
export async function renderMermaidBlocks(
  root: HTMLElement,
  options: MermaidBlockOptions,
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'));
  for (const block of blocks) {
    if (options.isCancelled?.()) {
      return;
    }
    if (!block.isConnected) {
      continue;
    }
    const diagram = block.querySelector<HTMLElement>('.mermaid-diagram');
    if (!diagram) {
      continue;
    }
    if (
      block.classList.contains('mermaid-rendered') &&
      block.dataset['mermaidTheme'] === options.theme
    ) {
      continue;
    }

    const source = block.querySelector('.mermaid-source')?.textContent ?? '';
    if (source.trim() === '') {
      showError(block, diagram, options.errorTitle);
      continue;
    }

    try {
      const svg = await options.render(source, options.theme);
      if (options.isCancelled?.() || !block.isConnected) {
        return;
      }
      diagram.innerHTML = svg;
      diagram.setAttribute('role', 'img');
      diagram.setAttribute('aria-label', options.diagramLabel);
      block.dataset['mermaidTheme'] = options.theme;
      block.classList.add('mermaid-rendered');
      block.querySelector('.mermaid-error')?.remove();
    } catch (error) {
      if (options.isCancelled?.() || !block.isConnected) {
        return;
      }
      showError(block, diagram, options.errorTitle, errorMessage(error));
    }
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_DETAIL_LENGTH
    ? `${message.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : message;
}

function showError(block: HTMLElement, diagram: HTMLElement, title: string, detail?: string): void {
  block.classList.remove('mermaid-rendered');
  delete block.dataset['mermaidTheme'];
  diagram.replaceChildren();
  diagram.removeAttribute('aria-label');

  let box = block.querySelector<HTMLElement>('.mermaid-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'mermaid-error';
    box.setAttribute('role', 'alert');
    block.prepend(box);
  }
  box.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'mermaid-error-title';
  heading.textContent = title;
  box.append(heading);

  if (detail) {
    const pre = document.createElement('pre');
    pre.className = 'mermaid-error-detail';
    pre.textContent = detail;
    box.append(pre);
  }
}
