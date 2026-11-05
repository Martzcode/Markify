import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMermaidBlocks } from './mermaid-blocks';

function createRoot(source = 'graph TD\n  A --> B'): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML =
    '<div class="mermaid-block">' +
    '<pre class="mermaid-source"><code class="language-mermaid"></code></pre>' +
    '<div class="mermaid-diagram" role="img"></div>' +
    '</div>';
  root.querySelector('.mermaid-source code')!.textContent = source;
  document.body.append(root);
  return root;
}

function options(
  render: (source: string, theme: 'default' | 'dark') => Promise<string>,
  overrides: Partial<Parameters<typeof renderMermaidBlocks>[1]> = {},
): Parameters<typeof renderMermaidBlocks>[1] {
  return {
    theme: 'default',
    render,
    errorTitle: 'Unable to render',
    diagramLabel: 'Mermaid diagram',
    ...overrides,
  };
}

describe('renderMermaidBlocks', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('replaces each placeholder with the rendered SVG', async () => {
    const root = createRoot();
    const render = vi.fn().mockResolvedValue('<svg id="diagram">ok</svg>');

    await renderMermaidBlocks(root, options(render));

    expect(render).toHaveBeenCalledWith('graph TD\n  A --> B', 'default');
    const block = root.querySelector('.mermaid-block')!;
    expect(block.classList.contains('mermaid-rendered')).toBe(true);
    expect(block.getAttribute('data-mermaid-theme')).toBe('default');
    const diagram = root.querySelector('.mermaid-diagram')!;
    expect(diagram.innerHTML).toContain('<svg');
    expect(diagram.getAttribute('aria-label')).toBe('Mermaid diagram');
    expect(root.querySelector('.mermaid-error')).toBeNull();
  });

  it('skips a diagram already rendered with the same theme', async () => {
    const root = createRoot();
    const render = vi.fn().mockResolvedValue('<svg></svg>');

    await renderMermaidBlocks(root, options(render));
    await renderMermaidBlocks(root, options(render));

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders again when the theme changes', async () => {
    const root = createRoot();
    const render = vi.fn().mockResolvedValue('<svg></svg>');

    await renderMermaidBlocks(root, options(render));
    await renderMermaidBlocks(root, options(render, { theme: 'dark' }));

    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith('graph TD\n  A --> B', 'dark');
    expect(root.querySelector('.mermaid-block')!.getAttribute('data-mermaid-theme')).toBe('dark');
  });

  it('shows a readable error and keeps the source when rendering fails', async () => {
    const root = createRoot();
    const render = vi.fn().mockRejectedValue(new Error('Parse error on line 2'));

    await renderMermaidBlocks(root, options(render));

    const block = root.querySelector('.mermaid-block')!;
    expect(block.classList.contains('mermaid-rendered')).toBe(false);
    const error = block.querySelector('.mermaid-error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.querySelector('.mermaid-error-title')?.textContent).toBe('Unable to render');
    expect(error.querySelector('.mermaid-error-detail')?.textContent).toBe('Parse error on line 2');
    expect(block.querySelector('.mermaid-source')?.textContent).toContain('A --> B');
  });

  it('removes the error once a later attempt succeeds', async () => {
    const root = createRoot();
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('broken'))
      .mockResolvedValueOnce('<svg></svg>');

    await renderMermaidBlocks(root, options(render));
    expect(root.querySelector('.mermaid-error')).not.toBeNull();

    await renderMermaidBlocks(root, options(render));
    expect(root.querySelector('.mermaid-error')).toBeNull();
    expect(root.querySelector('.mermaid-block')!.classList.contains('mermaid-rendered')).toBe(true);
  });

  it('reports an empty diagram instead of calling Mermaid', async () => {
    const root = createRoot('   ');
    const render = vi.fn();

    await renderMermaidBlocks(root, options(render));

    expect(render).not.toHaveBeenCalled();
    expect(root.querySelector('.mermaid-error-title')?.textContent).toBe('Unable to render');
  });

  it('abandons the result when the render becomes stale', async () => {
    const root = createRoot();
    let cancelled = false;
    const render = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return '<svg></svg>';
    });

    await renderMermaidBlocks(root, options(render, { isCancelled: () => cancelled }));

    const block = root.querySelector('.mermaid-block')!;
    expect(block.classList.contains('mermaid-rendered')).toBe(false);
    expect(root.querySelector('.mermaid-diagram')?.innerHTML).toBe('');
  });
});
