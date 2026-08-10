import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { ToastService } from './toast.service';

describe('DocumentService', () => {
  let service: DocumentService;
  let toast: ToastService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = TestBed.inject(DocumentService);
    toast = TestBed.inject(ToastService);
  });

  it('opens a markdown file and switches to read mode', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/test.md');
    vi.mocked(invoke).mockResolvedValue('# Hello');

    await service.openFile();

    expect(invoke).toHaveBeenCalledWith('read_markdown_file', {
      path: '/tmp/test.md',
    });
    expect(service.filePath()).toBe('/tmp/test.md');
    expect(service.content()).toBe('# Hello');
    expect(service.isOpen()).toBe(true);
    expect(service.mode()).toBe('read');
    expect(service.isDirty()).toBe(false);
  });

  it('does nothing when the open dialog is cancelled', async () => {
    vi.mocked(open).mockResolvedValue(null);

    await service.openFile();

    expect(invoke).not.toHaveBeenCalled();
    expect(service.filePath()).toBeNull();
    expect(service.isOpen()).toBe(false);
  });

  it('reports an error when the file cannot be read', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/missing.md');
    vi.mocked(invoke).mockRejectedValue(new Error('file not found'));

    await service.openFile();

    expect(service.error()).toContain('file not found');
    expect(service.filePath()).toBeNull();
  });

  it('creates a new file in edit mode', () => {
    service.setContent('old');
    service.filePath.set('/tmp/old.md');
    service.isOpen.set(true);
    service.setMode('read');
    service.isDirty.set(true);

    service.newFile();

    expect(service.content()).toBe('');
    expect(service.filePath()).toBeNull();
    expect(service.isOpen()).toBe(true);
    expect(service.mode()).toBe('edit');
    expect(service.isDirty()).toBe(false);
  });

  it('saves an existing file to its path without a dialog', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.filePath.set('/tmp/test.md');
    service.setContent('# Hello');

    await service.saveFile();

    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/test.md',
      content: '# Hello',
    });
    expect(save).not.toHaveBeenCalled();
    expect(service.filePath()).toBe('/tmp/test.md');
    expect(service.isDirty()).toBe(false);
  });

  it('asks for a path when saving a new file', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/new.md');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.setContent('# New');

    await service.saveFile();

    expect(save).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/new.md',
      content: '# New',
    });
    expect(service.filePath()).toBe('/tmp/new.md');
    expect(service.isDirty()).toBe(false);
  });

  it('does nothing when the save dialog is cancelled', async () => {
    vi.mocked(save).mockResolvedValue(null);
    service.setContent('# New');

    await service.saveFile();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('shows a toast when an existing file is saved', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.filePath.set('/tmp/test.md');
    service.setContent('# Hello');

    await service.saveFile();

    expect(toast.message()).toBe('Changes saved');
  });

  it('does not show a toast when saving a brand new file', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/new.md');
    vi.mocked(invoke).mockResolvedValue(undefined);
    service.setContent('# New');

    await service.saveFile();

    expect(toast.message()).toBeNull();
  });

  it('toggles between read and edit mode', () => {
    service.setMode('edit');
    expect(service.mode()).toBe('edit');

    service.toggleMode();
    expect(service.mode()).toBe('read');
  });

  it('marks the content as dirty when edited', () => {
    service.setContent('new content');
    expect(service.content()).toBe('new content');
    expect(service.isDirty()).toBe(true);
  });
});
