import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { invoke } from '@tauri-apps/api/core';
import { generatePdf } from '../utils/pdf-export';

const SYSTEM_FONT_CANDIDATES: Array<{ path: string; stem: string }> = [
  { path: '/usr/share/fonts/rsms-inter-fonts/Inter-Regular.ttf', stem: 'Inter' },
  { path: '/usr/share/fonts/adwaita-sans-fonts/AdwaitaSans-Regular.ttf', stem: 'AdwaitaSans' },
  { path: '/usr/share/fonts/google-noto/NotoSans-Regular.ttf', stem: 'NotoSans' },
  { path: '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf', stem: 'DejaVu' },
  { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', stem: 'DejaVu' },
];

describe('pdf-export image sizing', () => {
  beforeEach(() => {
    const font = SYSTEM_FONT_CANDIDATES.find((candidate) => existsSync(candidate.path));
    if (font) {
      const base64 = Buffer.from(readFileSync(font.path)).toString('base64');
      vi.mocked(invoke).mockResolvedValue([
        { role: 'normal', base64 },
        { role: 'bold', base64 },
        { role: 'italics', base64 },
        { role: 'bolditalics', base64 },
      ]);
    }
  });

  it('embeds a system font so unicode symbols render', async () => {
    const font = SYSTEM_FONT_CANDIDATES.find((candidate) => existsSync(candidate.path));
    if (!font) {
      return;
    }
    const result = await generatePdf('<p>ⓒ Ⓖ Ⓐ</p>', null);

    const text = Buffer.from(result.bytes).toString('latin1');
    expect(text).toContain(font.stem);
    if (font.stem === 'Inter' || font.stem === 'AdwaitaSans') {
      const streams = inflateAllStreams(result.bytes);
      expect(streams.some((s) => s.toLowerCase().includes('24bc'))).toBe(true);
    }
  });

  it('scales a large image down to the content width', async () => {
    const result = await generatePdf(
      `<p><img src="${pngDataUrl(1000, 500)}" alt="wide"></p>`,
      null,
    );

    expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe('%PDF');
    const streams = inflateAllStreams(result.bytes);
    const draw = streams.find((s) => s.includes(' Do'));
    expect(draw).toBeDefined();
    expect(draw).toMatch(/483\.28 0 0 -241\.64/);
  });

  it('does not upscale a small image', async () => {
    const result = await generatePdf(`<p><img src="${pngDataUrl(1, 1)}" alt="tiny"></p>`, null);

    const streams = inflateAllStreams(result.bytes);
    const draw = streams.find((s) => s.includes(' Do'));
    expect(draw).toBeDefined();
    expect(draw).toMatch(/1 0 0 -1 56/);
  });

  it('scales a tall image down to the content height', async () => {
    const result = await generatePdf(
      `<p><img src="${pngDataUrl(400, 1000)}" alt="tall"></p>`,
      null,
    );

    const streams = inflateAllStreams(result.bytes);
    const draw = streams.find((s) => s.includes(' Do'));
    expect(draw).toBeDefined();
    expect(draw).toMatch(/291\.\d+ 0 0 -729\.\d+/);
  });
});

function inflateAllStreams(pdf: Uint8Array): string[] {
  const text = Buffer.from(pdf).toString('latin1');
  const streams: string[] = [];
  const pattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    try {
      streams.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
    } catch {
      // not deflated
    }
  }
  return streams;
}

function pngDataUrl(width: number, height: number): string {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const idat = deflateSync(new Uint8Array(height * (1 + width)));
  const chunks = concat([
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
  const file = concat([signature, chunks]);
  return 'data:image/png;base64,' + Buffer.from(file).toString('base64');
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concat([typeBytes, data]);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(crcInput) >>> 0);
  return concat([length, typeBytes, data, crc]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
