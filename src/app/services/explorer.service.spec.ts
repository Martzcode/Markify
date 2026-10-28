import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { ConfirmService } from './confirm.service';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { UnsavedChangesService } from './unsaved-changes.service';

describe('ExplorerService', () => {
  let service: ExplorerService;

  beforeEach(() => {
    service = TestBed.inject(ExplorerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('opens a folder dialog and loads its root', async () => {
    vi.mocked(open).mockResolvedValue('/workspace');
    vi.mocked(invoke).mockResolvedValue([
      { name: 'docs', path: '/workspace/docs', isDir: true, children: [] },
      { name: 'README.md', path: '/workspace/README.md', isDir: false, children: [] },
    ]);

    await service.openFolder();

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/workspace' });
    expect(service.rootPath()).toBe('/workspace');
    expect(service.visible()).toBe(false);
    expect(service.rootEntries()).toHaveLength(2);
    expect(service.expanded()).toEqual(new Set(['/workspace']));
  });

  it('does nothing when the folder dialog is cancelled', async () => {
    vi.mocked(open).mockImplementation(() => Promise.resolve(null));

    await service.openFolder();

    expect(invoke).not.toHaveBeenCalled();
    expect(service.rootPath()).toBeNull();
    expect(service.visible()).toBe(false);
  });

  it('expands a directory by loading its children lazily', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([{ name: 'docs', path: '/workspace/docs', isDir: true, children: [] }]);
    vi.mocked(invoke).mockResolvedValue([
      { name: 'guide.md', path: '/workspace/docs/guide.md', isDir: false, children: [] },
    ]);

    await service.toggleDir('/workspace/docs');

    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/workspace/docs' });
    expect(service.expanded().has('/workspace/docs')).toBe(true);
    expect(service.childrenOf('/workspace/docs')).toHaveLength(1);

    await service.toggleDir('/workspace/docs');

    expect(service.expanded().has('/workspace/docs')).toBe(false);
  });

  it('reveals a file by loading its parent folder as root', async () => {
    vi.mocked(invoke).mockResolvedValue([
      { name: 'doc.md', path: '/some/dir/doc.md', isDir: false, children: [] },
    ]);

    await service.revealFile('/some/dir/doc.md');

    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/some/dir' });
    expect(service.rootPath()).toBe('/some/dir');
    expect(service.visible()).toBe(false);
    expect(service.selectedPath()).toBe('/some/dir/doc.md');
  });

  it('expands ancestors when revealing a file inside the open root', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([
      { name: 'a', path: '/workspace/a', isDir: true, children: [] },
      { name: 'top.md', path: '/workspace/top.md', isDir: false, children: [] },
    ]);
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      const path = (args as { path?: string } | undefined)?.path ?? '';
      if (path === '/workspace/a') {
        return [{ name: 'b', path: '/workspace/a/b', isDir: true, children: [] }];
      }
      return [{ name: 'deep.md', path: '/workspace/a/b/deep.md', isDir: false, children: [] }];
    });

    await service.revealFile('/workspace/a/b/deep.md');

    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/workspace/a' });
    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/workspace/a/b' });
    expect(service.rootPath()).toBe('/workspace');
    expect(service.selectedPath()).toBe('/workspace/a/b/deep.md');
    expect(service.expanded().has('/workspace/a')).toBe(true);
    expect(service.expanded().has('/workspace/a/b')).toBe(true);
  });

  it('toggles visibility', () => {
    service.hide();
    expect(service.visible()).toBe(false);
    service.toggle();
    expect(service.visible()).toBe(true);
    service.show();
    expect(service.visible()).toBe(true);
  });

  it('restores a folder and its expanded subfolders without a dialog', async () => {
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      const path = (args as { path?: string } | undefined)?.path ?? '';
      if (path === '/work') {
        return [{ name: 'sub', path: '/work/sub', isDir: true, children: [] }];
      }
      return [{ name: 'notes.md', path: '/work/sub/notes.md', isDir: false, children: [] }];
    });

    const restored = await service.openFolderAt('/work', ['/work/sub', '/outside']);

    expect(restored).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(service.rootPath()).toBe('/work');
    expect(service.expanded().has('/work/sub')).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith('list_directory', { path: '/outside' });
  });

  it('reports a folder that can no longer be read', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('ENOENT'));

    await expect(service.openFolderAt('/gone')).resolves.toBe(false);

    expect(service.rootEntries()).toEqual([]);
  });

  it('resets the explorer state', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await service.openFolderAt('/work');
    service.show();

    service.reset();

    expect(service.rootPath()).toBeNull();
    expect(service.visible()).toBe(false);
    expect(service.expanded()).toEqual(new Set());
  });

  it('closes the current folder and hides the panel when no document is open', async () => {
    vi.mocked(invoke).mockResolvedValue([
      { name: 'notes.md', path: '/work/notes.md', isDir: false, children: [] },
    ]);
    await service.openFolderAt('/work');
    service.show();
    service.select('/work/notes.md');
    const confirm = TestBed.inject(ConfirmService);

    await expect(service.closeFolder()).resolves.toBe(true);

    expect(confirm.isOpen()).toBe(false);
    expect(service.hasRoot()).toBe(false);
    expect(service.rootPath()).toBeNull();
    expect(service.rootEntries()).toEqual([]);
    expect(service.selectedPath()).toBeNull();
    expect(service.visible()).toBe(false);
  });

  it('asks for confirmation before closing the folder with an open document', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const document = TestBed.inject(DocumentService);
    const confirm = TestBed.inject(ConfirmService);
    await service.openFolderAt('/work');
    service.show();
    document.isOpen.set(true);
    document.isDirty.set(false);

    const pending = service.closeFolder();

    expect(confirm.isOpen()).toBe(true);
    expect(confirm.options()?.message).toContain('work');
    expect(document.isOpen()).toBe(true);

    confirm.accept();

    await expect(pending).resolves.toBe(true);
    expect(document.isOpen()).toBe(false);
    expect(service.hasRoot()).toBe(false);
  });

  it('keeps the folder open when the confirmation is cancelled', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const document = TestBed.inject(DocumentService);
    const confirm = TestBed.inject(ConfirmService);
    await service.openFolderAt('/work');
    service.show();
    document.isOpen.set(true);
    document.isDirty.set(false);

    const pending = service.closeFolder();
    confirm.cancel();

    await expect(pending).resolves.toBe(false);
    expect(document.isOpen()).toBe(true);
    expect(service.rootPath()).toBe('/work');
    expect(service.visible()).toBe(true);
  });

  it('keeps the folder open when the unsaved-changes dialog is cancelled', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const document = TestBed.inject(DocumentService);
    const confirm = TestBed.inject(ConfirmService);
    const unsaved = TestBed.inject(UnsavedChangesService);
    await service.openFolderAt('/work');
    service.show();
    document.isOpen.set(true);
    document.setContent('draft');

    const pending = service.closeFolder();
    confirm.accept();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unsaved.isOpen()).toBe(true);
    unsaved.resolve('cancel');

    await expect(pending).resolves.toBe(false);
    expect(document.isOpen()).toBe(true);
    expect(document.content()).toBe('draft');
    expect(service.rootPath()).toBe('/work');
  });

  it('closes the folder and discards the document on confirmation', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const document = TestBed.inject(DocumentService);
    const confirm = TestBed.inject(ConfirmService);
    const unsaved = TestBed.inject(UnsavedChangesService);
    await service.openFolderAt('/work');
    service.show();
    document.isOpen.set(true);
    document.filePath.set('/work/draft.md');
    document.setContent('draft');

    const pending = service.closeFolder();
    confirm.accept();
    await new Promise((resolve) => setTimeout(resolve, 0));

    unsaved.resolve('discard');

    await expect(pending).resolves.toBe(true);
    expect(document.isOpen()).toBe(false);
    expect(document.filePath()).toBeNull();
    expect(service.hasRoot()).toBe(false);
    expect(service.visible()).toBe(false);
  });
});
