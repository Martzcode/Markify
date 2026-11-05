import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { ConfirmService } from './confirm.service';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { FileWatchService, type FsChangedPayload } from './file-watch.service';
import { TabsService } from './tabs.service';

type FsHandler = (event: { payload: FsChangedPayload }) => void;

describe('FileWatchService', () => {
  let service: FileWatchService;
  let tabs: TabsService;
  let document: DocumentService;
  let explorer: ExplorerService;
  let confirm: ConfirmService;
  let handler: FsHandler = () => {};
  let readFileContent: MockInstance<DocumentService['readFileContent']>;

  beforeEach(async () => {
    vi.mocked(listen).mockImplementation((async (
      _event: string,
      callback: FsHandler,
    ) => {
      handler = callback;
      return () => {};
    }) as unknown as typeof listen);

    service = TestBed.inject(FileWatchService);
    tabs = TestBed.inject(TabsService);
    document = TestBed.inject(DocumentService);
    explorer = TestBed.inject(ExplorerService);
    confirm = TestBed.inject(ConfirmService);
    readFileContent = vi.spyOn(document, 'readFileContent');
    await service.start();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function openTab(
    path = '/workspace/notes.md',
    content = '# Notes',
  ): Promise<void> {
    readFileContent.mockResolvedValue(content);
    await tabs.openPath(path);
    TestBed.flushEffects();
  }

  function emit(paths: string[]): void {
    handler({ payload: { paths } });
  }

  it('reloads a clean tab when the file changes on disk', async () => {
    await openTab();
    const refresh = vi.spyOn(explorer, 'applyExternalChanges').mockResolvedValue();
    readFileContent.mockResolvedValue('# Changed outside');

    emit(['/workspace/notes.md']);

    await vi.waitFor(() => expect(document.content()).toBe('# Changed outside'));
    expect(document.isDirty()).toBe(false);
    expect(tabs.activeTab()?.content).toBe('# Changed outside');
    expect(refresh).toHaveBeenCalledWith(['/workspace/notes.md']);
  });

  it('ignores a notification when the disk matches the open tab (self-save)', async () => {
    await openTab();
    const apply = vi.spyOn(tabs, 'applyExternalContent');
    readFileContent.mockResolvedValue('# Notes');

    emit(['/workspace/notes.md']);

    await vi.waitFor(() => expect(readFileContent).toHaveBeenCalledWith('/workspace/notes.md'));
    expect(apply).not.toHaveBeenCalled();
    expect(document.content()).toBe('# Notes');
  });

  it('reloads from disk after the user accepts the conflict dialog', async () => {
    await openTab();
    document.setContent('# Local edit');
    TestBed.flushEffects();
    readFileContent.mockResolvedValue('# External edit');

    emit(['/workspace/notes.md']);
    await vi.waitFor(() => expect(confirm.isOpen()).toBe(true));

    expect(confirm.options()?.title).toBe('File changed on disk');
    confirm.accept();

    await vi.waitFor(() => expect(document.content()).toBe('# External edit'));
    expect(document.isDirty()).toBe(false);
    expect(tabs.activeTab()?.isDirty).toBe(false);
  });

  it('keeps local edits and remembers the ignored content', async () => {
    await openTab();
    document.setContent('# Local edit');
    TestBed.flushEffects();
    readFileContent.mockResolvedValue('# External edit');

    emit(['/workspace/notes.md']);
    await vi.waitFor(() => expect(confirm.isOpen()).toBe(true));
    confirm.cancel();

    await vi.waitFor(() => expect(confirm.isOpen()).toBe(false));
    expect(document.content()).toBe('# Local edit');
    expect(document.isDirty()).toBe(true);

    // La même version externe ne doit pas rouvrir le dialogue.
    emit(['/workspace/notes.md']);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(confirm.isOpen()).toBe(false);
    expect(document.content()).toBe('# Local edit');
  });

  it('watches only the root, expanded folders and tab parents', async () => {
    explorer.rootPath.set('/workspace');
    explorer.rootEntries.set([]);
    explorer.expanded.set(new Set(['/workspace', '/workspace/docs']));
    readFileContent.mockResolvedValue('# A');

    await tabs.openPath('/workspace/a.md');
    await tabs.openPath('/elsewhere/b.md');
    TestBed.flushEffects();

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('set_watched_paths', {
        paths: ['/elsewhere', '/workspace', '/workspace/docs'],
      }),
    );
  });

  it('clears the backend watches when stopped', async () => {
    explorer.rootPath.set('/workspace');
    explorer.expanded.set(new Set(['/workspace']));
    TestBed.flushEffects();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('set_watched_paths', {
        paths: ['/workspace'],
      }),
    );

    service.stop();

    expect(invoke).toHaveBeenCalledWith('set_watched_paths', { paths: [] });
  });
});
