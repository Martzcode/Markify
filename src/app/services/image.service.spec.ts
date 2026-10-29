import { TestBed } from '@angular/core/testing';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { vi } from 'vitest';
import { ImageService } from './image.service';

describe('ImageService', () => {
  let service: ImageService;

  beforeEach(() => {
    service = TestBed.inject(ImageService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('previewSrc', () => {
    it('returns relative sources unchanged when no document is saved', () => {
      expect(service.previewSrc('x', null)).toBe('x');
    });

    it('converts local images inside the document folder to asset URLs', () => {
      const result = service.previewSrc('./assets/photo.png', '/tmp/notes/doc.md');

      expect(convertFileSrc).toHaveBeenCalledWith('/tmp/notes/assets/photo.png');
      expect(result).toBe(`asset://localhost/${encodeURIComponent('/tmp/notes/assets/photo.png')}`);
    });

    it('rejects images outside the document folder', () => {
      expect(service.previewSrc('../secret.png', '/tmp/notes/doc.md')).toBeNull();
      expect(service.previewSrc('/tmp/secret.png', '/tmp/notes/doc.md')).toBeNull();
    });

    it('rejects asset URLs written directly in the Markdown', () => {
      expect(service.previewSrc('asset://localhost/secret.png', '/tmp/notes/doc.md')).toBeNull();
      expect(
        service.previewSrc('https://asset.localhost/secret.png', '/tmp/notes/doc.md'),
      ).toBeNull();
    });

    it('keeps remote and data URLs untouched', () => {
      expect(service.previewSrc('https://example.org/a.png', '/tmp/doc.md')).toBe(
        'https://example.org/a.png',
      );
      expect(service.previewSrc('data:image/png;base64,abc', '/tmp/doc.md')).toBe(
        'data:image/png;base64,abc',
      );
    });

    it('rejects unknown schemes', () => {
      expect(service.previewSrc('javascript:alert(1)', '/tmp/doc.md')).toBeNull();
      expect(service.previewSrc('file:///tmp/doc/photo.png', '/tmp/doc.md')).toBe(
        `asset://localhost/${encodeURIComponent('/tmp/doc/photo.png')}`,
      );
    });
  });

  describe('saveImage', () => {
    it('sends base64 data to the Rust command', async () => {
      vi.mocked(invoke).mockResolvedValue('./assets/photo.png');

      const result = await service.saveImage(
        new Uint8Array([1, 2, 3]),
        'photo.png',
        '/tmp/notes/doc.md',
      );

      expect(invoke).toHaveBeenCalledWith('save_image', {
        documentPath: '/tmp/notes/doc.md',
        fileName: 'photo.png',
        data: 'AQID',
      });
      expect(result).toBe('./assets/photo.png');
    });
  });

  describe('saveImageFromPath', () => {
    it('calls the Rust copy command', async () => {
      vi.mocked(invoke).mockResolvedValue('./assets/photo.png');

      await service.saveImageFromPath('/tmp/photo.png', '/tmp/notes/doc.md');

      expect(invoke).toHaveBeenCalledWith('save_image_from_path', {
        documentPath: '/tmp/notes/doc.md',
        sourcePath: '/tmp/photo.png',
      });
    });
  });

  describe('readClipboardImage', () => {
    it('returns null when the clipboard has no image', async () => {
      vi.mocked(readImage).mockRejectedValue(new Error('empty'));

      await expect(service.readClipboardImage()).resolves.toBeNull();
    });

    it('returns null when the clipboard API is unavailable', async () => {
      vi.mocked(readImage).mockResolvedValue(undefined as never);

      await expect(service.readClipboardImage()).resolves.toBeNull();
    });
  });
});
