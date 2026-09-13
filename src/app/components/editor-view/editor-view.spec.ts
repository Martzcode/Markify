import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EditorView } from './editor-view';
import { DocumentService } from '../../services/document.service';
import { TocService } from '../../services/toc.service';

describe('EditorView', () => {
  function createFixture(content: string, mode: 'read' | 'edit' | 'hybrid') {
    const document = TestBed.inject(DocumentService);
    document.setContent(content);
    document.setMode(mode);
    const fixture = TestBed.createComponent(EditorView);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorView],
    }).compileComponents();
  });

  it('scrolls the preview heading into view when the TOC navigates', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    const fixture = createFixture('# Intro\n\nSome text\n\n## Section\n\nEnd', 'read');
    const toc = TestBed.inject(TocService);
    toc.navigate('intro');
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('scrolls the textarea to each clicked heading in edit mode', () => {
    const fixture = createFixture('# Intro\n\nSome text\n\n## Section\n\nMore text\n\n### Sub', 'edit');
    const toc = TestBed.inject(TocService);
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const withMeasure = fixture.componentInstance as unknown as {
      measureLineTop(textarea: HTMLTextAreaElement, offset: number): number;
    };
    vi.spyOn(withMeasure, 'measureLineTop').mockImplementation((_textarea, offset) => offset * 2);

    const scrollLog: number[] = [];
    Object.defineProperty(textarea, 'scrollTop', {
      configurable: true,
      get() { return scrollLog.length > 0 ? scrollLog[scrollLog.length - 1] : 0; },
      set(v: number) { scrollLog.push(v); },
    });
    const focus = vi.spyOn(textarea, 'focus');
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange');

    toc.navigate('intro');
    TestBed.flushEffects();
    fixture.detectChanges();
    toc.navigate('section');
    TestBed.flushEffects();
    fixture.detectChanges();
    toc.navigate('sub');
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(scrollLog.length).toBe(3);
    expect(scrollLog).toEqual([...new Set(scrollLog)].sort((a, b) => a - b));
    expect(scrollLog.every((v) => v >= 0)).toBe(true);
    expect(setSelectionRange).toHaveBeenCalledTimes(3);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(textarea.selectionStart).not.toBe(0);
  });

  it('measures the line offset from the synchronised highlight pre', () => {
    const fixture = createFixture('# Intro\n\nSome text\n\n## Section\n\nMore text\n\n### Sub', 'edit');
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const highlight = fixture.nativeElement.querySelector('.editor-highlight') as HTMLElement;

    const fakeRange = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => [{ top: 300, bottom: 322.4, height: 22.4 }],
    } as unknown as Range;
    vi.spyOn(document, 'createRange').mockReturnValue(fakeRange);
    Object.defineProperty(highlight, 'scrollTop', { configurable: true, value: 40 });
    Object.defineProperty(highlight, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, bottom: 500, left: 0, right: 600 }),
    });

    const withMeasure = fixture.componentInstance as unknown as {
      measureLineTop(textarea: HTMLTextAreaElement, offset: number): number;
    };
    const top = withMeasure.measureLineTop(textarea, 9);
    expect(top).toBe(300 - 100 + 40);
    expect(fakeRange.setStart).toHaveBeenCalled();
    expect(fakeRange.setEnd).toHaveBeenCalled();
  });

  it('scrolls both the preview and the textarea when the TOC navigates in hybrid mode', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    const fixture = createFixture('# Intro\n\nSome text\n\n## Section\n\nMore text', 'hybrid');
    const toc = TestBed.inject(TocService);
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const withMeasure = fixture.componentInstance as unknown as {
      measureLineTop(textarea: HTMLTextAreaElement, offset: number): number;
    };
    vi.spyOn(withMeasure, 'measureLineTop').mockImplementation((_textarea, offset) => offset * 2);
    const scrollLog: number[] = [];
    Object.defineProperty(textarea, 'scrollTop', {
      configurable: true,
      get() { return scrollLog.length > 0 ? scrollLog[scrollLog.length - 1] : 0; },
      set(v: number) { scrollLog.push(v); },
    });
    const focus = vi.spyOn(textarea, 'focus');
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange');

    toc.navigate('section');
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollLog.length).toBe(1);
    expect(setSelectionRange).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('keeps the caret at the clicked heading across consecutive navigations', () => {
    const fixture = createFixture('# Intro\n\nSome text\n\n## Section\n\nEnd', 'edit');
    const toc = TestBed.inject(TocService);
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    Object.defineProperty(textarea, 'clientHeight', { configurable: true, value: 40 });
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 400 });
    const withMeasure = fixture.componentInstance as unknown as {
      measureLineTop(textarea: HTMLTextAreaElement, offset: number): number;
    };
    vi.spyOn(withMeasure, 'measureLineTop').mockImplementation((_textarea, offset) => offset * 2);

    toc.navigate('intro');
    TestBed.flushEffects();
    fixture.detectChanges();
    const first = textarea.selectionStart;
    toc.navigate('section');
    TestBed.flushEffects();
    fixture.detectChanges();
    const second = textarea.selectionStart;

    expect(first).toBe(0);
    expect(second).toBeGreaterThan(first);
  });
});
