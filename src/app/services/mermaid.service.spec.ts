import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MermaidService } from './mermaid.service';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: mermaidMock }));

describe('MermaidService', () => {
  beforeEach(() => {
    mermaidMock.initialize.mockClear();
    mermaidMock.render.mockReset().mockResolvedValue({ svg: '<svg></svg>' });
  });

  it('initializes Mermaid in strict mode on the first render', async () => {
    const service = new MermaidService();

    await expect(service.render('graph TD; A-->B', 'default')).resolves.toBe('<svg></svg>');

    expect(mermaidMock.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'default',
    });
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
  });

  it('uses unique ids for each diagram', async () => {
    const service = new MermaidService();

    await service.render('graph TD; A-->B', 'default');
    await service.render('graph TD; C-->D', 'default');

    const first = mermaidMock.render.mock.calls[0][0] as string;
    const second = mermaidMock.render.mock.calls[1][0] as string;
    expect(first).toMatch(/^markify-mermaid-\d+$/);
    expect(second).not.toBe(first);
  });

  it('caches a diagram for the same source and theme', async () => {
    const service = new MermaidService();

    await service.render('graph TD; A-->B', 'default');
    await service.render('graph TD; A-->B', 'default');

    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
  });

  it('reinitializes Mermaid when the theme changes', async () => {
    const service = new MermaidService();

    await service.render('graph TD; A-->B', 'default');
    await service.render('graph TD; A-->B', 'dark');

    expect(mermaidMock.initialize).toHaveBeenCalledTimes(2);
    expect(mermaidMock.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
    expect(mermaidMock.render).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed render', async () => {
    const service = new MermaidService();
    mermaidMock.render
      .mockRejectedValueOnce(new Error('Parse error'))
      .mockResolvedValueOnce({ svg: '<svg></svg>' });

    await expect(service.render('broken', 'default')).rejects.toThrow('Parse error');
    await expect(service.render('broken', 'default')).resolves.toBe('<svg></svg>');
    expect(mermaidMock.render).toHaveBeenCalledTimes(2);
  });
});
