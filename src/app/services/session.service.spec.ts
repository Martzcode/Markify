import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { PhysicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { SESSION_STORAGE_KEY, SessionService, type SessionState } from './session.service';
import { TabsService, type RestorableTab } from './tabs.service';
import { TocService } from './toc.service';
import { ToastService } from './toast.service';

describe('SessionService', () => {
  let session: SessionService;
  let document: DocumentService;
  let tabs: TabsService;
  let explorer: ExplorerService;
  let toc: TocService;
  let toast: ToastService;

  beforeEach(() => {
    localStorage.clear();
    session = TestBed.inject(SessionService);
    document = TestBed.inject(DocumentService);
    tabs = TestBed.inject(TabsService);
    explorer = TestBed.inject(ExplorerService);
    toc = TestBed.inject(TocService);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  function seed(state: Partial<SessionState>): void {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        tabs: [],
        activeTab: 0,
        folderPath: null,
        explorerVisible: false,
        tocVisible: false,
        expandedPaths: [],
        window: null,
        ...state,
      }),
    );
  }

  function seedLegacy(state: Record<string, unknown>): void {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ version: 1, scroll: { editor: 0, preview: 0 }, ...state }),
    );
  }

  function tab(overrides: Partial<RestorableTab> = {}): RestorableTab {
    return {
      filePath: null,
      content: '',
      isDirty: false,
      mode: 'read',
      scroll: { editor: 0, preview: 0 },
      ...overrides,
    };
  }

  function readSaved(): SessionState | null {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionState) : null;
  }

  it('starts empty when there is no saved session', async () => {
    await session.restore();

    expect(document.isOpen()).toBe(false);
    expect(tabs.hasTabs()).toBe(false);
    expect(explorer.hasRoot()).toBe(false);
  });

  it('restores the last file, mode, folder and panels', async () => {
    vi.mocked(invoke).mockImplementation(((command: string, args?: { path?: string }) => {
      if (command === 'list_directory') {
        return Promise.resolve(
          args?.path === '/work'
            ? [{ name: 'sub', path: '/work/sub', isDir: true, children: [] }]
            : [],
        );
      }
      if (command === 'read_markdown_file') {
        return Promise.resolve('# Restored');
      }
      return Promise.resolve(null);
    }) as unknown as typeof invoke);
    seed({
      tabs: [
        tab({
          filePath: '/work/sub/notes.md',
          mode: 'edit',
          scroll: { editor: 0.42, preview: 0 },
        }),
      ],
      folderPath: '/work',
      explorerVisible: true,
      expandedPaths: ['/work/sub'],
    });

    await session.restore();

    expect(tabs.tabs()).toHaveLength(1);
    expect(document.content()).toBe('# Restored');
    expect(document.filePath()).toBe('/work/sub/notes.md');
    expect(document.isOpen()).toBe(true);
    expect(document.mode()).toBe('edit');
    expect(tabs.activeTab()?.scroll).toEqual({ editor: 0.42, preview: 0 });
    expect(explorer.rootPath()).toBe('/work');
    expect(explorer.visible()).toBe(true);
    expect(explorer.expanded().has('/work/sub')).toBe(true);
  });

  it('restores several tabs and keeps the active one', async () => {
    vi.mocked(invoke).mockImplementation(((command: string, args?: { path?: string }) => {
      if (command === 'read_markdown_file') {
        return Promise.resolve(`# ${args?.path}`);
      }
      return Promise.resolve([]);
    }) as unknown as typeof invoke);
    seed({
      tabs: [tab({ filePath: '/work/a.md' }), tab({ filePath: '/work/b.md' })],
      activeTab: 1,
    });

    await session.restore();

    expect(tabs.tabs()).toHaveLength(2);
    expect(tabs.activeIndex()).toBe(1);
    expect(document.filePath()).toBe('/work/b.md');
    expect(document.content()).toBe('# /work/b.md');
  });

  it('restores the table of contents when it was the visible panel', async () => {
    seed({ tocVisible: true, explorerVisible: false });

    await session.restore();

    expect(toc.visible()).toBe(true);
    expect(explorer.visible()).toBe(false);
  });

  it('gives priority to the explorer when both panels were saved', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    seed({ folderPath: '/work', explorerVisible: true, tocVisible: true });

    await session.restore();

    expect(explorer.visible()).toBe(true);
    expect(toc.visible()).toBe(false);
  });

  it('restores the table of contents when the saved folder is gone', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));
    seed({ folderPath: '/gone', explorerVisible: true, tocVisible: true });

    await session.restore();

    expect(explorer.visible()).toBe(false);
    expect(toc.visible()).toBe(true);
  });

  it('falls back to an empty editor when the saved file is gone', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));
    seed({ tabs: [tab({ filePath: '/gone/notes.md', mode: 'hybrid' })] });

    await session.restore();

    expect(document.isOpen()).toBe(false);
    expect(document.filePath()).toBeNull();
    expect(document.mode()).toBe('read');
    expect(tabs.hasTabs()).toBe(false);
    expect(toast.message()).toContain('notes.md');
    expect(readSaved()?.tabs).toEqual([]);
  });

  it('forgets the explorer when the saved folder is gone', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));
    seed({ folderPath: '/gone', explorerVisible: true });

    await session.restore();

    expect(explorer.hasRoot()).toBe(false);
    expect(explorer.visible()).toBe(false);
    expect(readSaved()?.folderPath).toBeNull();
  });

  it('migrates a version 1 session to a single tab', async () => {
    vi.mocked(invoke).mockResolvedValue('# Legacy');
    seedLegacy({ filePath: '/tmp/legacy.md', mode: 'hybrid' });

    await session.restore();

    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.activeIndex()).toBe(0);
    expect(document.content()).toBe('# Legacy');
    expect(document.filePath()).toBe('/tmp/legacy.md');
    expect(document.mode()).toBe('hybrid');
    expect(readSaved()?.version).toBe(2);
  });

  it('ignores a corrupt or outdated session payload', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not json');
    await session.restore();
    expect(document.isOpen()).toBe(false);

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 99, filePath: '/x.md' }));
    document.filePath.set(null);
    await session.restore();

    expect(document.isOpen()).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith('read_markdown_file', expect.anything());
  });

  it('persists state changes after the debounce', async () => {
    vi.useFakeTimers();
    await session.restore();

    tabs.newTab();
    document.filePath.set('/tmp/notes.md');
    document.setMode('hybrid');
    session.scheduleSave();

    expect(readSaved()?.tabs).toEqual([]);

    vi.advanceTimersByTime(600);

    const saved = readSaved();
    expect(saved?.tabs).toHaveLength(1);
    expect(saved?.tabs[0].filePath).toBe('/tmp/notes.md');
    expect(saved?.tabs[0].mode).toBe('hybrid');
  });

  it('flushes pending changes immediately', async () => {
    vi.useFakeTimers();
    await session.restore();

    tabs.newTab();
    document.setMode('edit');
    session.scheduleSave();
    session.flush();

    expect(readSaved()?.tabs[0].mode).toBe('edit');
  });

  it('persists the active tab index and tab order', async () => {
    vi.useFakeTimers();
    await session.restore();

    tabs.newTab();
    tabs.newTab();
    const first = tabs.tabs()[0];
    tabs.activate(first.id);
    session.flush();

    expect(readSaved()?.activeTab).toBe(0);
    expect(readSaved()?.tabs).toHaveLength(2);
  });

  it('persists dirty drafts and untitled content', async () => {
    vi.useFakeTimers();
    await session.restore();

    tabs.newTab();
    document.setContent('draft text');
    session.flush();

    const saved = readSaved();
    expect(saved?.tabs[0].content).toBe('draft text');
    expect(saved?.tabs[0].isDirty).toBe(true);
  });

  it('does not persist the content of a clean saved file', async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockResolvedValue('# Saved');
    await session.restore();

    await tabs.openPath('/tmp/notes.md');
    session.flush();

    const saved = readSaved();
    expect(saved?.tabs[0].filePath).toBe('/tmp/notes.md');
    expect(saved?.tabs[0].content).toBeNull();
    expect(saved?.tabs[0].isDirty).toBe(false);
  });

  it('reapplies the saved window size once the window is shown', async () => {
    const win = getCurrentWindow();
    vi.mocked(win.isMaximized).mockResolvedValueOnce(false);
    seed({ window: { width: 1000, height: 700 } });

    await session.restore();

    expect(win.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 1000, height: 700 }));
  });

  it('leaves a maximized window alone', async () => {
    const win = getCurrentWindow();
    vi.mocked(win.isMaximized).mockResolvedValueOnce(true);
    seed({ window: { width: 1000, height: 700 } });

    await session.restore();

    expect(win.setSize).not.toHaveBeenCalled();
  });

  it('remembers the initial window size on the first launch', async () => {
    const win = getCurrentWindow();
    vi.mocked(win.innerSize).mockResolvedValueOnce(new PhysicalSize(1024, 768));

    await session.restore();

    expect(readSaved()?.window).toEqual({ width: 1024, height: 768 });
  });

  it('stores the size when the window is resized', async () => {
    vi.useFakeTimers();
    const win = getCurrentWindow();
    await session.restore();
    const listener = vi.mocked(win.onResized).mock.calls[0]?.[0] as unknown as (event: {
      payload: PhysicalSize;
    }) => Promise<void>;

    await listener({ payload: new PhysicalSize(900, 620) });
    vi.advanceTimersByTime(600);

    expect(readSaved()?.window).toEqual({ width: 900, height: 620 });
  });

  it('ignores resizes while the window is maximized', async () => {
    vi.useFakeTimers();
    const win = getCurrentWindow();
    await session.restore();
    const listener = vi.mocked(win.onResized).mock.calls[0]?.[0] as unknown as (event: {
      payload: PhysicalSize;
    }) => Promise<void>;
    vi.mocked(win.isMaximized).mockResolvedValueOnce(true);

    await listener({ payload: new PhysicalSize(1920, 1080) });
    vi.advanceTimersByTime(600);

    expect(readSaved()?.window).toEqual({ width: 1200, height: 800 });
  });

  it('stores each tab scroll position without writing on every event', async () => {
    vi.useFakeTimers();
    await session.restore();

    tabs.newTab();
    session.captureScroll({ editor: 0.4 });
    session.captureScroll({ editor: 0.5 });
    vi.advanceTimersByTime(600);

    expect(readSaved()?.tabs[0].scroll).toEqual({ editor: 0.5, preview: 0 });
  });
});
