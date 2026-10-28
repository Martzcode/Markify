import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { PhysicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { SESSION_STORAGE_KEY, SessionService, type SessionState } from './session.service';
import { TocService } from './toc.service';
import { ToastService } from './toast.service';

describe('SessionService', () => {
  let session: SessionService;
  let document: DocumentService;
  let explorer: ExplorerService;
  let toc: TocService;
  let toast: ToastService;

  beforeEach(() => {
    localStorage.clear();
    session = TestBed.inject(SessionService);
    document = TestBed.inject(DocumentService);
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
      JSON.stringify({ version: 1, scroll: { editor: 0, preview: 0 }, ...state }),
    );
  }

  function readSaved(): SessionState | null {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionState) : null;
  }

  it('starts empty when there is no saved session', async () => {
    await session.restore();

    expect(document.isOpen()).toBe(false);
    expect(explorer.hasRoot()).toBe(false);
    expect(session.pendingScroll()).toBeNull();
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
      filePath: '/work/sub/notes.md',
      folderPath: '/work',
      mode: 'edit',
      explorerVisible: true,
      expandedPaths: ['/work/sub'],
      scroll: { editor: 0.42, preview: 0 },
    });

    await session.restore();

    expect(document.content()).toBe('# Restored');
    expect(document.filePath()).toBe('/work/sub/notes.md');
    expect(document.isOpen()).toBe(true);
    expect(document.mode()).toBe('edit');
    expect(explorer.rootPath()).toBe('/work');
    expect(explorer.visible()).toBe(true);
    expect(explorer.expanded().has('/work/sub')).toBe(true);
    expect(session.pendingScroll()).toEqual({ editor: 0.42, preview: 0 });
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
    seed({ filePath: '/gone/notes.md', mode: 'hybrid' });

    await session.restore();

    expect(document.isOpen()).toBe(false);
    expect(document.filePath()).toBeNull();
    expect(document.mode()).toBe('read');
    expect(toast.message()).toContain('notes.md');
    expect(readSaved()?.filePath).toBeNull();
  });

  it('forgets the explorer when the saved folder is gone', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));
    seed({ folderPath: '/gone', explorerVisible: true });

    await session.restore();

    expect(explorer.hasRoot()).toBe(false);
    expect(explorer.visible()).toBe(false);
    expect(readSaved()?.folderPath).toBeNull();
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

    document.filePath.set('/tmp/notes.md');
    document.setMode('hybrid');
    session.scheduleSave();

    expect(readSaved()?.filePath).toBeNull();

    vi.advanceTimersByTime(600);

    const saved = readSaved();
    expect(saved?.filePath).toBe('/tmp/notes.md');
    expect(saved?.mode).toBe('hybrid');
  });

  it('flushes pending changes immediately', async () => {
    vi.useFakeTimers();
    await session.restore();

    document.setMode('edit');
    session.scheduleSave();
    session.flush();

    expect(readSaved()?.mode).toBe('edit');
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

  it('stores scroll positions without writing on every event', async () => {
    vi.useFakeTimers();
    await session.restore();

    session.captureScroll({ editor: 0.4 });
    session.captureScroll({ editor: 0.5 });
    vi.advanceTimersByTime(600);

    expect(readSaved()?.scroll).toEqual({ editor: 0.5, preview: 0 });
  });
});
