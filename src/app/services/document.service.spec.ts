import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { vi } from 'vitest';
import { DocumentService } from './document.service';

describe('DocumentService', () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = TestBed.inject(DocumentService);
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
    expect(service.mode()).toBe('read');
    expect(service.isDirty()).toBe(false);
  });

  it('does nothing when the dialog is cancelled', async () => {
    vi.mocked(open).mockResolvedValue(null);

    await service.openFile();

    expect(invoke).not.toHaveBeenCalled();
    expect(service.filePath()).toBeNull();
  });

  it('reports an error when the file cannot be read', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/missing.md');
    vi.mocked(invoke).mockRejectedValue(new Error('file not found'));

    await service.openFile();

    expect(service.error()).toContain('file not found');
    expect(service.filePath()).toBeNull();
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
