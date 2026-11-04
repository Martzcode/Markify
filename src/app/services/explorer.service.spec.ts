import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { vi } from 'vitest';
import { I18nService } from '../i18n/i18n.service';
import { ConfirmService } from './confirm.service';
import { DocumentService } from './document.service';
import { ExplorerService } from './explorer.service';
import { TabsService } from './tabs.service';
import { ToastService } from './toast.service';
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

  it('closes the tabs located under the folder', async () => {
    vi.mocked(invoke).mockImplementation(((command: string, args?: { path?: string }) => {
      if (command === 'list_directory') {
        return Promise.resolve([]);
      }
      return Promise.resolve(`# ${args?.path}`);
    }) as unknown as typeof invoke);
    const tabs = TestBed.inject(TabsService);
    const confirm = TestBed.inject(ConfirmService);
    await service.openFolderAt('/work');
    await tabs.openPath('/work/a.md');
    await tabs.openPath('/outside/b.md');

    const pending = service.closeFolder();
    confirm.accept();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(pending).resolves.toBe(true);
    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.activeTab()?.filePath).toBe('/outside/b.md');
    expect(service.hasRoot()).toBe(false);
    expect(service.visible()).toBe(false);
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

  it('creates a file inline and opens it in a tab', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([]);
    service.expanded.set(new Set(['/workspace']));
    vi.mocked(invoke).mockImplementation((async (command: string, args?: unknown) => {
      const request = args as { parent?: string; name?: string; path?: string };
      if (command === 'create_entry') {
        return `${request.parent}/${request.name}`;
      }
      if (command === 'read_markdown_file') {
        return '';
      }
      return [];
    }) as unknown as typeof invoke);
    const tabs = TestBed.inject(TabsService);
    const openTab = vi.spyOn(tabs, 'openPath').mockResolvedValue(true);

    await service.beginCreate('/workspace', false);
    await expect(service.commitCreate('note')).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('create_entry', {
      parent: '/workspace',
      name: 'note.md',
      isDir: false,
    });
    expect(openTab).toHaveBeenCalledWith('/workspace/note.md');
    expect(service.creating()).toBeNull();
    expect(service.selectedPath()).toBe('/workspace/note.md');
  });

  it('creates a folder inline without opening a tab', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([]);
    service.expanded.set(new Set(['/workspace']));
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'create_entry') {
        return '/workspace/docs';
      }
      return [];
    }) as unknown as typeof invoke);
    const tabs = TestBed.inject(TabsService);
    const openTab = vi.spyOn(tabs, 'openPath').mockResolvedValue(true);

    await service.beginCreate('/workspace', true);
    await expect(service.commitCreate('docs')).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('create_entry', {
      parent: '/workspace',
      name: 'docs',
      isDir: true,
    });
    expect(openTab).not.toHaveBeenCalled();
  });

  it('renames an entry and updates the open tab path', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'read_markdown_file') {
        return '# note';
      }
      if (command === 'rename_entry') {
        return '/workspace/renamed.md';
      }
      return [];
    }) as unknown as typeof invoke);
    service.rootPath.set('/workspace');
    service.rootEntries.set([]);
    service.expanded.set(new Set(['/workspace']));
    const tabs = TestBed.inject(TabsService);
    await tabs.openPath('/workspace/note.md');

    service.beginRename({
      name: 'note.md',
      path: '/workspace/note.md',
      isDir: false,
      children: [],
    });
    await expect(service.commitRename('renamed')).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('rename_entry', {
      path: '/workspace/note.md',
      newName: 'renamed.md',
    });
    expect(tabs.tabs()[0].filePath).toBe('/workspace/renamed.md');
    expect(service.renaming()).toBeNull();
  });

  it('duplicates an entry and keeps the original', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'duplicate_entry') {
        return '/workspace/note-copie.md';
      }
      return [];
    }) as unknown as typeof invoke);
    service.rootPath.set('/workspace');
    service.rootEntries.set([]);
    service.expanded.set(new Set(['/workspace']));

    await expect(
      service.duplicate({ name: 'note.md', path: '/workspace/note.md', isDir: false, children: [] }),
    ).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith(
      'duplicate_entry',
      expect.objectContaining({ path: '/workspace/note.md', suffix: expect.any(String) }),
    );
    expect(service.selectedPath()).toBe('/workspace/note-copie.md');
  });

  it('deletes an entry after confirmation and refreshes the folder', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([
      { name: 'note.md', path: '/workspace/note.md', isDir: false, children: [] },
    ]);
    service.expanded.set(new Set(['/workspace']));
    service.selectedPath.set('/workspace/note.md');
    const confirm = TestBed.inject(ConfirmService);
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'delete_entry') {
        return undefined;
      }
      return [];
    }) as unknown as typeof invoke);

    const pending = service.remove({
      name: 'note.md',
      path: '/workspace/note.md',
      isDir: false,
      children: [],
    });
    confirm.accept();
    await expect(pending).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('delete_entry', { path: '/workspace/note.md' });
    expect(service.rootEntries()).toEqual([]);
    expect(service.selectedPath()).toBeNull();
  });

  it('keeps the entry when the delete confirmation is cancelled', async () => {
    service.rootPath.set('/workspace');
    const confirm = TestBed.inject(ConfirmService);

    const pending = service.remove({
      name: 'note.md',
      path: '/workspace/note.md',
      isDir: false,
      children: [],
    });
    confirm.cancel();
    await expect(pending).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalledWith('delete_entry', expect.anything());
  });

  it('reveals an entry in the system file manager', async () => {
    await service.reveal({
      name: 'note.md',
      path: '/workspace/note.md',
      isDir: false,
      children: [],
    });

    expect(revealItemInDir).toHaveBeenCalledWith('/workspace/note.md');
  });

  it('copies an entry path to the clipboard', async () => {
    TestBed.inject(I18nService).setLang('en');
    await service.copyPath({
      name: 'note.md',
      path: '/workspace/note.md',
      isDir: false,
      children: [],
    });

    expect(writeText).toHaveBeenCalledWith('/workspace/note.md');
    expect(TestBed.inject(ToastService).message()).toBe('Path copied');
  });

  it('refreshes the root and expanded folders from disk', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([]);
    service.expanded.set(new Set(['/workspace', '/workspace/docs']));
    vi.mocked(invoke).mockImplementation((async (command: string, args?: unknown) => {
      const path = (args as { path?: string } | undefined)?.path ?? '';
      if (path === '/workspace/docs') {
        return [{ name: 'guide.md', path: '/workspace/docs/guide.md', isDir: false, children: [] }];
      }
      return [{ name: 'docs', path: '/workspace/docs', isDir: true, children: [] }];
    }) as unknown as typeof invoke);

    await service.refresh();

    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/workspace' });
    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/workspace/docs' });
    expect(service.rootEntries()).toHaveLength(1);
    expect(service.childrenOf('/workspace/docs')).toHaveLength(1);
    expect(service.isExpanded('/workspace/docs')).toBe(true);
  });

  it('moves a dragged entry into a folder', async () => {
    service.rootPath.set('/workspace');
    service.rootEntries.set([]);
    service.expanded.set(new Set(['/workspace']));
    const entry = {
      name: 'note.md',
      path: '/workspace/note.md',
      isDir: false,
      children: [],
    };
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'move_entry') {
        return '/workspace/docs/note.md';
      }
      return [];
    }) as unknown as typeof invoke);

    service.beginDrag(entry);
    expect(service.canDropOn('/workspace/docs')).toBe(true);
    expect(service.canDropOn('/workspace')).toBe(false);
    await expect(service.dropOn('/workspace/docs')).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('move_entry', {
      path: '/workspace/note.md',
      targetDir: '/workspace/docs',
    });
    expect(service.selectedPath()).toBe('/workspace/docs/note.md');
    expect(service.dragged()).toBeNull();
  });

  it('refuses to drop a folder inside itself', () => {
    service.beginDrag({
      name: 'docs',
      path: '/workspace/docs',
      isDir: true,
      children: [],
    });

    expect(service.canDropOn('/workspace/docs/nested')).toBe(false);
  });
});
