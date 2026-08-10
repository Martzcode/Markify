import { vi } from 'vitest';
import { ThemeService } from './theme.service';

interface MockMql {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function installMatchMedia(matches: boolean): MockMql {
  const mql: MockMql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return mql;
}

describe('ThemeService', () => {
  afterEach(() => {
    delete document.documentElement.dataset['theme'];
  });

  it('applies the system theme on init', () => {
    installMatchMedia(false);
    new ThemeService();
    expect(document.documentElement.dataset['theme']).toBe('light');

    installMatchMedia(true);
    new ThemeService();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('reacts to system theme changes', () => {
    const mql = installMatchMedia(false);
    const service = new ThemeService();
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');

    mql.matches = true;
    const handler = mql.addEventListener.mock.calls[0][1] as (event: {
      matches: boolean;
    }) => void;
    handler({ matches: true });

    expect(service.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
