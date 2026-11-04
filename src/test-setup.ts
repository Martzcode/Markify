import { vi } from 'vitest';

// Node.js 26 exposes `localStorage`/`sessionStorage` getters that return
// `undefined` unless `--localstorage-file` is set. Vitest's jsdom environment
// does not override those globals, so provide an in-memory fallback.
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[name]?.getItem !== 'function') {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

// jsdom does not implement `Worker`, but pdfmake's browser build relies on one
// to inflate PNG pixel data (through fflate). Emulate the small subset it needs
// by running the worker script synchronously inside the test process.
if (typeof globalThis.Worker === 'undefined') {
  const blobSources = new WeakMap<Blob, string>();
  const NativeBlob = globalThis.Blob;

  function RecordingBlob(parts: BlobPart[] = [], options?: BlobPropertyBag): Blob {
    const blob = new NativeBlob(parts, options);
    blobSources.set(
      blob,
      parts.map((part) => (typeof part === 'string' ? part : '')).join(''),
    );
    return blob;
  }
  RecordingBlob.prototype = NativeBlob.prototype;

  const workerUrls = new Map<string, string>();
  let workerUrlId = 0;

  globalThis.Blob = RecordingBlob as unknown as typeof Blob;
  URL.createObjectURL = (blob: Blob | MediaSource): string => {
    const url = `blob:markify/${++workerUrlId}`;
    workerUrls.set(url, blob instanceof NativeBlob ? (blobSources.get(blob) ?? '') : '');
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    workerUrls.delete(url);
  };

  class WorkerShim {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { error?: Error }) => void) | null = null;
    private readonly handle: ((data: unknown) => void) | null;

    constructor(url: string) {
      const source = workerUrls.get(url) ?? '';
      // fflate stores shared lookup tables on `self`, which is the global
      // object inside a real worker; mirror that so bare identifiers resolve.
      const self = globalThis as unknown as Record<string, unknown>;
      const postMessage = (data: unknown): void => {
        queueMicrotask(() => this.onmessage?.({ data }));
      };
      const addEventListener = (type: string, listener: (event: { error?: Error }) => void) => {
        if (type === 'error') {
          this.onerror = listener;
        }
      };
      const factory = new Function(
        'self',
        'postMessage',
        'addEventListener',
        `var onmessage;\n${source}\nreturn function (data) {\n` +
          `  if (typeof onmessage === 'function') onmessage({ data });\n};`,
      );
      this.handle = factory(self, postMessage, addEventListener) as (data: unknown) => void;
    }

    postMessage(data: unknown): void {
      this.handle?.(data);
    }

    terminate(): void {
      // Nothing to release: the shim runs in the main thread.
    }
  }

  globalThis.Worker = WorkerShim as unknown as typeof Worker;
}

vi.mock('@tauri-apps/api/window', () => {
  const windowMock = {
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    setFullscreen: vi.fn().mockResolvedValue(undefined),
    isFullscreen: vi.fn().mockResolvedValue(false),
    innerSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
    setSize: vi.fn().mockResolvedValue(undefined),
    onResized: vi.fn().mockResolvedValue(() => {}),
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  };
  return { getCurrentWindow: () => windowMock };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(),
  readText: vi.fn(),
  readImage: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
  revealItemInDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('9.9.9'),
}));
