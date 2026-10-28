import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, type CloseRequestedEvent } from '@tauri-apps/api/window';
import { vi } from 'vitest';
import { DocumentService } from './document.service';
import { SessionService } from './session.service';
import { UnsavedChangesService } from './unsaved-changes.service';
import { WindowCloseGuardService } from './window-close-guard.service';

type CloseHandler = (event: CloseRequestedEvent) => void | Promise<void>;

describe('WindowCloseGuardService', () => {
  let guard: WindowCloseGuardService;
  let document: DocumentService;
  let unsaved: UnsavedChangesService;
  let session: SessionService;
  let handler: CloseHandler;
  let win: ReturnType<typeof getCurrentWindow>;
  beforeEach(async () => {
    vi.clearAllMocks();
    guard = TestBed.inject(WindowCloseGuardService);
    document = TestBed.inject(DocumentService);
    unsaved = TestBed.inject(UnsavedChangesService);
    session = TestBed.inject(SessionService);
    win = getCurrentWindow();
    await guard.start();
    handler = vi.mocked(win.onCloseRequested).mock.calls.at(-1)![0] as CloseHandler;
  });

  afterEach(() => {
    guard.ngOnDestroy();
    vi.clearAllMocks();
  });

  function makeEvent(): { event: CloseRequestedEvent; preventDefault: ReturnType<typeof vi.fn> } {
    const preventDefault = vi.fn();
    return { event: { preventDefault } as unknown as CloseRequestedEvent, preventDefault };
  }

  it('lets a clean document close without confirmation', async () => {
    const { event, preventDefault } = makeEvent();

    await handler(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(unsaved.isOpen()).toBe(false);
  });

  it('asks for confirmation and keeps the window open when the user cancels', async () => {
    const flush = vi.spyOn(session, 'flush');
    document.setContent('draft');
    const { event, preventDefault } = makeEvent();

    const pending = handler(event);
    expect(unsaved.isOpen()).toBe(true);

    unsaved.resolve('cancel');
    await pending;

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });

  it('flushes the session before allowing the window to close', async () => {
    const flush = vi.spyOn(session, 'flush');
    document.setContent('draft');
    const { event } = makeEvent();

    const pending = handler(event);
    unsaved.resolve('discard');
    await pending;

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('closes the window after the user discards changes', async () => {
    document.setContent('draft');
    const { event, preventDefault } = makeEvent();

    const pending = handler(event);
    unsaved.resolve('discard');
    await pending;

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('closes the window after saving changes', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    document.setContent('draft');
    document.filePath.set('/tmp/draft.md');
    const { event, preventDefault } = makeEvent();

    const pending = handler(event);
    unsaved.resolve('save');
    await pending;

    expect(invoke).toHaveBeenCalledWith('write_markdown_file', {
      path: '/tmp/draft.md',
      content: 'draft',
    });
    expect(document.isDirty()).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('keeps the window open when saving fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('disk full'));
    document.setContent('draft');
    document.filePath.set('/tmp/draft.md');
    const { event, preventDefault } = makeEvent();

    const pending = handler(event);
    unsaved.resolve('save');
    await pending;

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.error()).toContain('disk full');
  });

  it('does not stack a second dialog on a repeated close request', async () => {
    document.setContent('draft');
    const first = makeEvent();
    const second = makeEvent();

    const pending = handler(first.event);
    await handler(second.event);

    expect(second.preventDefault).toHaveBeenCalledTimes(1);

    unsaved.resolve('discard');
    await pending;
  });

  it('starts the listener only once', async () => {
    await guard.start();

    expect(vi.mocked(win.onCloseRequested)).toHaveBeenCalledTimes(1);
  });
});
