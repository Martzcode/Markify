import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KatexService } from './katex.service';

const katexMock = vi.hoisted(() => ({
  renderToString: vi.fn(),
}));

vi.mock('katex', () => ({ default: katexMock }));

describe('KatexService', () => {
  beforeEach(() => {
    katexMock.renderToString.mockReset().mockReturnValue('<span class="katex">ok</span>');
  });

  it('renders with safe options', async () => {
    const service = new KatexService();

    await expect(service.render('x^2', false)).resolves.toBe('<span class="katex">ok</span>');

    expect(katexMock.renderToString).toHaveBeenCalledWith(
      'x^2',
      expect.objectContaining({
        displayMode: false,
        throwOnError: true,
        trust: false,
        output: 'htmlAndMathml',
      }),
    );
  });

  it('passes display mode for block formulas', async () => {
    const service = new KatexService();

    await service.render('x^2', true);

    expect(katexMock.renderToString).toHaveBeenCalledWith(
      'x^2',
      expect.objectContaining({ displayMode: true }),
    );
  });

  it('caches a formula by source and display mode', async () => {
    const service = new KatexService();

    await service.render('x^2', false);
    await service.render('x^2', false);
    expect(katexMock.renderToString).toHaveBeenCalledTimes(1);

    await service.render('x^2', true);
    expect(katexMock.renderToString).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed render', async () => {
    const service = new KatexService();
    katexMock.renderToString
      .mockImplementationOnce(() => {
        throw new Error('Parse error');
      })
      .mockReturnValueOnce('<span class="katex">ok</span>');

    await expect(service.render('broken', false)).rejects.toThrow('Parse error');
    await expect(service.render('broken', false)).resolves.toBe('<span class="katex">ok</span>');
    expect(katexMock.renderToString).toHaveBeenCalledTimes(2);
  });
});
