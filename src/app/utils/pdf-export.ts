import { invoke } from '@tauri-apps/api/core';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

const PAGE_MARGIN = 56;
const MAX_IMAGE_WIDTH = 595.28 - PAGE_MARGIN * 2;
const MAX_IMAGE_HEIGHT = 841.89 - PAGE_MARGIN * 2;

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

let fontsLoaded = false;

export interface PdfExportResult {
  bytes: Uint8Array;
  skippedImages: string[];
}

export async function generatePdf(html: string, baseDir: string | null): Promise<PdfExportResult> {
  const { html: resolvedHtml, skippedImages } = await resolveImages(html, baseDir);
  const [{ default: htmlToPdfmake }, { default: pdfMake }, { default: pdfFonts }] =
    await Promise.all([
      import('html-to-pdfmake'),
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
    ]);
  if (!fontsLoaded) {
    pdfMake.addVirtualFileSystem(pdfFonts);
    fontsLoaded = true;
  }
  const content = htmlToPdfmake(resolvedHtml, { removeExtraBlanks: true }) as Content;
  constrainImages(content);
  const docDefinition: TDocumentDefinitions = {
    content,
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: {
      fontSize: 10.5,
      lineHeight: 1.35,
    },
  };
  const pdf = pdfMake.createPdf(docDefinition);
  const blob = await pdf.getBlob();
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    skippedImages,
  };
}

async function resolveImages(
  html: string,
  baseDir: string | null,
): Promise<{ html: string; skippedImages: string[] }> {
  if (!html.includes('<img')) {
    return { html, skippedImages: [] };
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const images = Array.from(parsed.querySelectorAll('img[src]'));
  const skippedImages: string[] = [];
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('data:')) {
        return;
      }
      try {
        const dataUrl = await imageToDataUrl(src, baseDir);
        img.setAttribute('src', dataUrl);
      } catch {
        skippedImages.push(src);
        img.remove();
      }
    }),
  );
  return { html: parsed.body.innerHTML, skippedImages };
}

async function imageToDataUrl(src: string, baseDir: string | null): Promise<string> {
  if (/^https?:\/\//i.test(src)) {
    return fetchRemoteImage(src);
  }
  const path = resolveLocalPath(src, baseDir);
  const base64 = await invoke<string>('read_image_base64', { path });
  return `data:${mimeForPath(path)};base64,${base64}`;
}

async function fetchRemoteImage(url: string): Promise<string> {
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
  const response = await tauriFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const mime = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0];
  return `data:${mime};base64,${toBase64(new Uint8Array(buffer))}`;
}

function resolveLocalPath(src: string, baseDir: string | null): string {
  const clean = src.startsWith('file://') ? src.slice('file://'.length) : src;
  const isAbsolute = /^([a-zA-Z]:[\\/])|\//.test(clean);
  if (isAbsolute) {
    return clean;
  }
  if (!baseDir) {
    throw new Error(`Cannot resolve relative image path without a saved document: ${src}`);
  }
  return `${baseDir}/${clean}`;
}

function mimeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function constrainImages(content: unknown): void {
  if (Array.isArray(content)) {
    for (const node of content) {
      constrainImages(node);
    }
    return;
  }
  if (!content || typeof content !== 'object') {
    return;
  }
  const node = content as Record<string, unknown>;
  if (typeof node['image'] === 'string') {
    node['maxWidth'] = MAX_IMAGE_WIDTH;
    node['maxHeight'] = MAX_IMAGE_HEIGHT;
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      constrainImages(value);
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
