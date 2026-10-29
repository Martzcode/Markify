import { describe, expect, it } from 'vitest';
import {
  documentDirectory,
  imageAltFromPath,
  isImagePath,
  resolveLocalImagePath,
} from './image-path';

describe('isImagePath', () => {
  it('accepts known image extensions case-insensitively', () => {
    expect(isImagePath('photo.PNG')).toBe(true);
    expect(isImagePath('/tmp/a/b.jpeg')).toBe(true);
    expect(isImagePath('https://example.org/pic.webp?size=2')).toBe(true);
  });

  it('rejects files that are not images', () => {
    expect(isImagePath('notes.md')).toBe(false);
    expect(isImagePath('photo')).toBe(false);
    expect(isImagePath('.png')).toBe(false);
    expect(isImagePath('archive.png.zip')).toBe(false);
  });
});

describe('imageAltFromPath', () => {
  it('returns the base name without its extension', () => {
    expect(imageAltFromPath('/tmp/assets/my photo.png')).toBe('my photo');
    expect(imageAltFromPath('C:\\images\\cat.jpeg')).toBe('cat');
    expect(imageAltFromPath('photo.png?x=1')).toBe('photo');
  });
});

describe('documentDirectory', () => {
  it('returns the folder containing the document', () => {
    expect(documentDirectory('/tmp/notes/doc.md')).toBe('/tmp/notes');
    expect(documentDirectory('/notes.md')).toBe('/');
    expect(documentDirectory('C:\\docs\\note.md')).toBe('C:/docs');
  });

  it('returns null when there is no document or folder', () => {
    expect(documentDirectory(null)).toBeNull();
    expect(documentDirectory('notes.md')).toBeNull();
  });
});

describe('resolveLocalImagePath', () => {
  const document = '/tmp/notes/doc.md';

  it('resolves relative paths inside the document folder', () => {
    expect(resolveLocalImagePath('./assets/photo.png', document)).toBe(
      '/tmp/notes/assets/photo.png',
    );
    expect(resolveLocalImagePath('assets/photo.png', document)).toBe('/tmp/notes/assets/photo.png');
    expect(resolveLocalImagePath('../notes/assets/photo.png', document)).toBe(
      '/tmp/notes/assets/photo.png',
    );
  });

  it('decodes percent-encoded characters and drops query strings and anchors', () => {
    expect(resolveLocalImagePath('./assets/my%20photo.png?size=2#top', document)).toBe(
      '/tmp/notes/assets/my photo.png',
    );
  });

  it('accepts file URLs and absolute paths inside the document folder', () => {
    expect(resolveLocalImagePath('file:///tmp/notes/assets/photo.png', document)).toBe(
      '/tmp/notes/assets/photo.png',
    );
    expect(resolveLocalImagePath('/tmp/notes/assets/photo.png', document)).toBe(
      '/tmp/notes/assets/photo.png',
    );
  });

  it('rejects paths outside the document folder', () => {
    expect(resolveLocalImagePath('../secret.png', document)).toBeNull();
    expect(resolveLocalImagePath('/tmp/secret.png', document)).toBeNull();
    expect(resolveLocalImagePath('../../etc/passwd.png', document)).toBeNull();
  });

  it('rejects non-image, remote and data sources', () => {
    expect(resolveLocalImagePath('./assets/notes.md', document)).toBeNull();
    expect(resolveLocalImagePath('https://example.org/pic.png', document)).toBeNull();
    expect(resolveLocalImagePath('data:image/png;base64,abc', document)).toBeNull();
    expect(resolveLocalImagePath('asset://localhost/photo.png', document)).toBeNull();
  });

  it('handles Windows drive paths', () => {
    expect(resolveLocalImagePath('C:\\docs\\assets\\photo.png', 'C:\\docs\\note.md')).toBe(
      'C:/docs/assets/photo.png',
    );
    expect(resolveLocalImagePath('..\\secret.png', 'C:\\docs\\note.md')).toBeNull();
  });

  it('requires a document path for relative sources', () => {
    expect(resolveLocalImagePath('./photo.png', null)).toBeNull();
  });

  it('joins paths without a double slash when the document sits at the root', () => {
    expect(resolveLocalImagePath('./assets/photo.png', '/notes.md')).toBe('/assets/photo.png');
    expect(resolveLocalImagePath('assets/photo.png', '/notes.md')).toBe('/assets/photo.png');
  });
});
