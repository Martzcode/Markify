import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMathElements } from './math-blocks';

function createRoot(
  className: 'math-inline' | 'math-block' = 'math-inline',
  source = 'x^2',
): HTMLElement {
  const root = document.createElement('div');
  const element = document.createElement(className === 'math-block' ? 'div' : 'span');
  element.className = className;
  element.setAttribute('role', 'math');
  element.textContent = source;
  root.append(element);
  document.body.append(root);
  return root;
}

function options(
  render: (source: string, displayMode: boolean) => Promise<string>,
  overrides: Partial<Parameters<typeof renderMathElements>[1]> = {},
): Parameters<typeof renderMathElements>[1] {
  return {
    render,
    errorTitle: 'Unable to render',
    ...overrides,
  };
}

describe('renderMathElements', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('replaces inline math with the rendered KaTeX HTML', async () => {
    const root = createRoot();
    const render = vi.fn().mockResolvedValue('<span class="katex">ok</span>');

    await renderMathElements(root, options(render));

    expect(render).toHaveBeenCalledWith('x^2', false);
    const element = root.querySelector('.math-inline')!;
    expect(element.classList.contains('math-rendered')).toBe(true);
    expect(element.innerHTML).toContain('class="katex"');
    expect(element.getAttribute('title')).toBeNull();
  });

  it('passes display mode for block math', async () => {
    const root = createRoot('math-block');
    const render = vi.fn().mockResolvedValue('<span class="katex-display">ok</span>');

    await renderMathElements(root, options(render));

    expect(render).toHaveBeenCalledWith('x^2', true);
    expect(root.querySelector('.math-block')!.classList.contains('math-rendered')).toBe(true);
  });

  it('skips an element already rendered', async () => {
    const root = createRoot();
    const render = vi.fn().mockResolvedValue('<span class="katex">ok</span>');

    await renderMathElements(root, options(render));
    await renderMathElements(root, options(render));

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('keeps the source and shows a tooltip when rendering fails', async () => {
    const root = createRoot();
    const render = vi.fn().mockRejectedValue(new Error('Parse error'));

    await renderMathElements(root, options(render));

    const element = root.querySelector('.math-inline')!;
    expect(element.classList.contains('math-rendered')).toBe(false);
    expect(element.classList.contains('math-error')).toBe(true);
    expect(element.textContent).toBe('x^2');
    expect(element.getAttribute('title')).toBe('Unable to render Parse error');
  });

  it('removes the error once a later attempt succeeds', async () => {
    const root = createRoot();
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('broken'))
      .mockResolvedValueOnce('<span class="katex">ok</span>');

    await renderMathElements(root, options(render));
    expect(root.querySelector('.math-error')).not.toBeNull();

    await renderMathElements(root, options(render));
    const element = root.querySelector('.math-inline')!;
    expect(element.classList.contains('math-error')).toBe(false);
    expect(element.classList.contains('math-rendered')).toBe(true);
  });

  it('reports an empty formula instead of calling KaTeX', async () => {
    const root = createRoot('math-inline', '   ');
    const render = vi.fn();

    await renderMathElements(root, options(render));

    expect(render).not.toHaveBeenCalled();
    expect(root.querySelector('.math-error')).not.toBeNull();
  });

  it('abandons the result when the render becomes stale', async () => {
    const root = createRoot();
    let cancelled = false;
    const render = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return '<span class="katex">ok</span>';
    });

    await renderMathElements(root, options(render, { isCancelled: () => cancelled }));

    const element = root.querySelector('.math-inline')!;
    expect(element.classList.contains('math-rendered')).toBe(false);
    expect(element.innerHTML).toBe('x^2');
  });
});
