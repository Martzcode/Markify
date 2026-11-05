export interface MathElementOptions {
  /** Rend la source TeX en HTML KaTeX. */
  render: (source: string, displayMode: boolean) => Promise<string>;
  errorTitle: string;
  /** Permet d'abandonner un rendu devenu obsolète (contenu changé). */
  isCancelled?: () => boolean;
}

const MAX_ERROR_DETAIL_LENGTH = 300;

/**
 * Remplace les emplacements de formules de l'aperçu par le rendu KaTeX.
 *
 * Les sources sont lues dans le DOM : elles ont déjà été échappées par le
 * rendu Markdown. KaTeX est configuré avec `trust: false`, son HTML est donc
 * sûr à injecter. Les formules sont traitées séquentiellement pour ne pas
 * saturer le thread pendant la frappe.
 */
export async function renderMathElements(
  root: HTMLElement,
  options: MathElementOptions,
): Promise<void> {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.math-inline:not(.math-rendered), .math-block:not(.math-rendered)',
    ),
  );
  for (const element of elements) {
    if (options.isCancelled?.() || !element.isConnected) {
      return;
    }
    const source = element.textContent?.trim() ?? '';
    if (source === '') {
      showError(element, source, options.errorTitle);
      continue;
    }

    const displayMode = element.classList.contains('math-block');
    try {
      const html = await options.render(source, displayMode);
      if (options.isCancelled?.() || !element.isConnected) {
        return;
      }
      element.innerHTML = html;
      element.classList.add('math-rendered');
      element.classList.remove('math-error');
      element.removeAttribute('title');
    } catch (error) {
      if (options.isCancelled?.() || !element.isConnected) {
        return;
      }
      showError(element, source, options.errorTitle, errorMessage(error));
    }
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_DETAIL_LENGTH
    ? `${message.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : message;
}

function showError(
  element: HTMLElement,
  source: string,
  title: string,
  detail?: string,
): void {
  element.classList.remove('math-rendered');
  element.classList.add('math-error');
  element.textContent = source;
  element.setAttribute('role', 'math');
  element.setAttribute('title', detail ? `${title} ${detail}` : title);
}
