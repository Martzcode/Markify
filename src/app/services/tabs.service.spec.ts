import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { TabsService } from './tabs.service';
import { ToastService } from './toast.service';
import { UnsavedChangesService } from './unsaved-changes.service';

describe('TabsService', () => {
  let tabs: TabsService;
  let document: DocumentService;
  let unsaved: UnsavedChangesService;
  let toast: ToastService;

  beforeEach(() => {
    tabs = TestBed.inject(TabsService);
    document = TestBed.inject(DocumentService);
    unsaved = TestBed.inject(UnsavedChangesService);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates a new untitled tab and opens it in edit mode', () => {
    tabs.newTab();

    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.activeIndex()).toBe(0);
    expect(tabs.activeTab()?.filePath).toBeNull();
    expect(tabs.title(tabs.activeTab()!)).toBe('Untitled');
    expect(document.isOpen()).toBe(true);
    expect(document.mode()).toBe('edit');
  });

  it('opens a file in a new tab in read mode', async () => {
    vi.mocked(invoke).mockResolvedValue('# Hello');

    await expect(tabs.openPath('/tmp/notes.md')).resolves.toBe(true);

    expect(tabs.tabs()).toHaveLength(1);
    expect(document.content()).toBe('# Hello');
    expect(document.filePath()).toBe('/tmp/notes.md');
    expect(document.mode()).toBe('read');
    expect(document.isDirty()).toBe(false);
  });

  it('reuses the tab of a file that is already open', async () => {
    vi.mocked(invoke).mockResolvedValue('# Hello');
    await tabs.openPath('/tmp/notes.md');
    tabs.newTab();

    await expect(tabs.openPath('/tmp/notes.md')).resolves.toBe(true);

    expect(tabs.tabs()).toHaveLength(2);
    expect(tabs.activeIndex()).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rebases every tab path under a renamed folder', async () => {
    vi.mocked(invoke).mockImplementation(((_command: string, args?: { path?: string }) =>
      Promise.resolve(`# ${args?.path}`)) as unknown as typeof invoke);
    await tabs.openPath('/workspace/a.md');
    await tabs.openPath('/workspace/sub/b.md');

    tabs.rebasePath('/workspace', '/renamed');

    expect(tabs.tabs().map((tab) => tab.filePath)).toEqual([
      '/renamed/a.md',
      '/renamed/sub/b.md',
    ]);
    expect(document.filePath()).toBe('/renamed/sub/b.md');
  });

  it('reports a file that cannot be opened', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));

    await expect(tabs.openPath('/tmp/missing.md')).resolves.toBe(false);

    expect(tabs.tabs()).toHaveLength(0);
    expect(toast.message()).toContain('missing.md');
  });

  it('opens every file selected in the dialog', async () => {
    vi.mocked(open).mockResolvedValue(['/tmp/a.md', '/tmp/b.md']);
    vi.mocked(invoke).mockImplementation(((_command: string, args?: { path?: string }) =>
      Promise.resolve(`# ${args?.path}`)) as unknown as typeof invoke);

    await expect(tabs.openFileDialog()).resolves.toBe(true);

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
    expect(tabs.tabs()).toHaveLength(2);
    expect(tabs.activeIndex()).toBe(1);
    expect(document.filePath()).toBe('/tmp/b.md');
  });

  it('does nothing when the file dialog is cancelled', async () => {
    vi.mocked(open).mockResolvedValue(null);

    await expect(tabs.openFileDialog()).resolves.toBe(false);

    expect(tabs.tabs()).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps the content, mode and history of each tab when switching', () => {
    tabs.newTab();
    document.setContent('alpha');
    document.setMode('hybrid');
    const first = tabs.activeId()!;
    TestBed.flushEffects();

    tabs.newTab();
    document.setContent('beta');
    const second = tabs.activeId()!;
    TestBed.flushEffects();

    expect(tabs.activate(first)).toBe(true);
    expect(document.content()).toBe('alpha');
    expect(document.mode()).toBe('hybrid');
    expect(document.isDirty()).toBe(true);
    expect(document.canUndo()).toBe(true);

    expect(tabs.activate(second)).toBe(true);
    expect(document.content()).toBe('beta');
    expect(document.mode()).toBe('edit');
  });

  it('marks the tab as modified when the document changes', () => {
    tabs.newTab();
    TestBed.flushEffects();
    expect(tabs.activeTab()?.isDirty).toBe(false);

    document.setContent('draft');
    TestBed.flushEffects();

    expect(tabs.activeTab()?.isDirty).toBe(true);
  });

  it('asks for confirmation before closing a modified tab', async () => {
    tabs.newTab();
    document.setContent('draft');
    TestBed.flushEffects();
    const id = tabs.activeId()!;

    const pending = tabs.closeTab(id);
    expect(unsaved.isOpen()).toBe(true);
    unsaved.resolve('cancel');

    await expect(pending).resolves.toBe(false);
    expect(tabs.tabs()).toHaveLength(1);
    expect(document.content()).toBe('draft');
  });

  it('closes a modified tab after discarding changes', async () => {
    tabs.newTab();
    document.setContent('draft');
    TestBed.flushEffects();
    const id = tabs.activeId()!;

    const pending = tabs.closeTab(id);
    unsaved.resolve('discard');

    await expect(pending).resolves.toBe(true);
    expect(tabs.tabs()).toHaveLength(0);
    expect(document.isOpen()).toBe(false);
    expect(document.content()).toBe('');
  });

  it('activates the neighbouring tab after closing the active one', async () => {
    tabs.newTab();
    tabs.newTab();
    const second = tabs.activeId()!;
    tabs.newTab();
    const third = tabs.activeId()!;

    tabs.activate(second);

    await expect(tabs.closeTab(second)).resolves.toBe(true);
    expect(tabs.activeId()).toBe(third);
  });

  it('closes only the tabs located under a folder', async () => {
    vi.mocked(invoke).mockResolvedValue('# File');
    await tabs.openPath('/work/a.md');
    await tabs.openPath('/work/sub/b.md');
    await tabs.openPath('/outside/c.md');

    await expect(tabs.closeTabsUnder('/work')).resolves.toBe(true);

    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.activeTab()?.filePath).toBe('/outside/c.md');
  });

  it('checks every modified tab before closing the window', async () => {
    tabs.newTab();
    document.setContent('first');
    TestBed.flushEffects();
    tabs.newTab();
    document.setContent('second');
    TestBed.flushEffects();

    const pending = tabs.confirmCloseAll();
    expect(unsaved.isOpen()).toBe(true);
    unsaved.resolve('discard');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unsaved.isOpen()).toBe(true);
    unsaved.resolve('cancel');

    await expect(pending).resolves.toBe(false);
  });

  it('keeps earlier tabs intact when a later close confirmation is cancelled', async () => {
    tabs.newTab();
    document.setContent('first');
    TestBed.flushEffects();
    tabs.newTab();
    document.setContent('second');
    TestBed.flushEffects();

    const pending = tabs.confirmCloseAll();
    unsaved.resolve('discard');
    await new Promise((resolve) => setTimeout(resolve, 0));
    unsaved.resolve('cancel');

    await expect(pending).resolves.toBe(false);
    expect(tabs.tabs()[0].content).toBe('first');
    expect(tabs.tabs()[0].isDirty).toBe(true);
    expect(tabs.tabs()[1].content).toBe('second');
    expect(tabs.tabs()[1].isDirty).toBe(true);
  });

  it('applies every discard once all tabs are confirmed', async () => {
    tabs.newTab();
    document.setContent('first');
    TestBed.flushEffects();
    tabs.newTab();
    document.setContent('second');
    TestBed.flushEffects();

    const pending = tabs.confirmCloseAll();
    unsaved.resolve('discard');
    await new Promise((resolve) => setTimeout(resolve, 0));
    unsaved.resolve('discard');

    await expect(pending).resolves.toBe(true);
    expect(tabs.tabs().every((tab) => !tab.isDirty)).toBe(true);
    expect(tabs.tabs().every((tab) => tab.content === '')).toBe(true);
  });

  it('cycles through tabs in both directions and wraps around', () => {
    tabs.newTab();
    tabs.newTab();
    tabs.newTab();
    expect(tabs.activeIndex()).toBe(2);

    tabs.cycle(1);
    expect(tabs.activeIndex()).toBe(0);

    tabs.cycle(-1);
    expect(tabs.activeIndex()).toBe(2);
  });

  it('reorders tabs with drag and drop', () => {
    tabs.newTab();
    tabs.newTab();
    tabs.newTab();
    const ids = tabs.tabs().map((tab) => tab.id);

    tabs.moveTab(0, 2);

    expect(tabs.tabs().map((tab) => tab.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(tabs.moveTab(-1, 0)).toBeUndefined();
    expect(tabs.tabs().map((tab) => tab.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('remembers the scroll position of each tab', () => {
    tabs.newTab();
    const first = tabs.activeId()!;
    expect(tabs.captureScroll({ editor: 0.25 })).toBe(true);

    tabs.newTab();
    expect(tabs.captureScroll({ editor: 0.75 })).toBe(true);

    tabs.activate(first);
    expect(tabs.activeTab()?.scroll.editor).toBe(0.25);
    tabs.cycle(1);
    expect(tabs.activeTab()?.scroll.editor).toBe(0.75);
  });

  it('serializes untitled and modified tabs with their content', async () => {
    tabs.newTab();
    document.setContent('draft');
    TestBed.flushEffects();

    const serialized = tabs.serialize();

    expect(serialized).toHaveLength(1);
    expect(serialized[0].filePath).toBeNull();
    expect(serialized[0].content).toBe('draft');
    expect(serialized[0].isDirty).toBe(true);
  });

  it('does not serialize the content of a clean saved tab', async () => {
    vi.mocked(invoke).mockResolvedValue('# Saved');
    await tabs.openPath('/tmp/notes.md');

    const serialized = tabs.serialize();

    expect(serialized[0].content).toBeNull();
    expect(serialized[0].isDirty).toBe(false);
  });

  it('restores a dirty draft without reading it from disk', async () => {
    await tabs.restore(
      [
        {
          filePath: '/tmp/draft.md',
          content: 'unsaved work',
          isDirty: true,
          mode: 'hybrid',
          scroll: { editor: 0.3, preview: 0.1 },
        },
      ],
      0,
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(document.content()).toBe('unsaved work');
    expect(document.isDirty()).toBe(true);
    expect(document.mode()).toBe('hybrid');
    expect(tabs.activeTab()?.scroll).toEqual({ editor: 0.3, preview: 0.1 });
  });

  it('drops a restored tab whose file is gone', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));

    await tabs.restore(
      [
        {
          filePath: '/gone/notes.md',
          content: null,
          isDirty: false,
          mode: 'read',
          scroll: { editor: 0, preview: 0 },
        },
      ],
      0,
    );

    expect(tabs.tabs()).toHaveLength(0);
    expect(document.isOpen()).toBe(false);
    expect(toast.message()).toContain('notes.md');
  });

  it('applies external content to the active tab without marking it dirty', async () => {
    vi.mocked(invoke).mockResolvedValue('# Original');
    await tabs.openPath('/tmp/notes.md');
    document.setContent('# Local edit');
    TestBed.flushEffects();

    expect(tabs.applyExternalContent('/tmp/notes.md', '# From disk')).toBe(true);

    expect(document.content()).toBe('# From disk');
    expect(document.isDirty()).toBe(false);
    expect(tabs.activeTab()?.content).toBe('# From disk');
  });

  it('updates an inactive tab without touching the active document', async () => {
    vi.mocked(invoke).mockResolvedValue('# A');
    await tabs.openPath('/tmp/a.md');
    await tabs.openPath('/tmp/b.md');

    expect(tabs.applyExternalContent('/tmp/a.md', '# A changed')).toBe(true);

    expect(tabs.tabs()[0].content).toBe('# A changed');
    expect(tabs.tabs()[0].isDirty).toBe(false);
    expect(document.content()).toBe('# A');
  });
});
