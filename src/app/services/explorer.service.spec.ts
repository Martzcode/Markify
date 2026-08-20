import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { ExplorerService } from './explorer.service';

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
    expect(service.visible()).toBe(true);
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
    expect(service.visible()).toBe(true);
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
});
