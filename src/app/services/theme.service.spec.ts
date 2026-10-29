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

function systemChangeHandler(mql: MockMql): (event: { matches: boolean }) => void {
  return mql.addEventListener.mock.calls[0][1] as (event: { matches: boolean }) => void;
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('reacts to system theme changes in auto mode', () => {
    const mql = installMatchMedia(false);
    const service = new ThemeService();
    expect(service.preference()).toBe('auto');
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');

    mql.matches = true;
    systemChangeHandler(mql)({ matches: true });

    expect(service.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('applies and persists a manual preference', () => {
    installMatchMedia(true);
    const service = new ThemeService();
    expect(service.isDark()).toBe(true);

    service.setPreference('light');
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('markify.theme')).toBe('light');

    service.setPreference('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('markify.theme')).toBe('dark');
  });

  it('restores the saved preference', () => {
    localStorage.setItem('markify.theme', 'dark');
    installMatchMedia(false);

    const service = new ThemeService();

    expect(service.preference()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('ignores system changes when a manual preference is set', () => {
    const mql = installMatchMedia(false);
    const service = new ThemeService();
    service.setPreference('light');

    systemChangeHandler(mql)({ matches: true });

    expect(service.isDark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('follows the system again after switching back to auto', () => {
    const mql = installMatchMedia(false);
    const service = new ThemeService();
    service.setPreference('dark');
    expect(service.isDark()).toBe(true);

    service.setPreference('auto');
    expect(service.isDark()).toBe(false);

    systemChangeHandler(mql)({ matches: true });
    expect(service.isDark()).toBe(true);
  });

  it('falls back to auto when the stored value is invalid', () => {
    localStorage.setItem('markify.theme', 'purple');
    installMatchMedia(true);

    const service = new ThemeService();

    expect(service.preference()).toBe('auto');
    expect(service.isDark()).toBe(true);
  });

  it('reports the next preference in the cycle order', () => {
    installMatchMedia(false);
    const service = new ThemeService();
    expect(service.nextPreference()).toBe('light');

    service.setPreference('light');
    expect(service.nextPreference()).toBe('dark');

    service.setPreference('dark');
    expect(service.nextPreference()).toBe('auto');
  });

  it('cycles light → dark → auto and persists each step', () => {
    installMatchMedia(false);
    const service = new ThemeService();
    service.setPreference('auto');

    service.cycle();
    expect(service.preference()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('markify.theme')).toBe('light');

    service.cycle();
    expect(service.preference()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('markify.theme')).toBe('dark');

    service.cycle();
    expect(service.preference()).toBe('auto');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('markify.theme')).toBe('auto');
  });
});
