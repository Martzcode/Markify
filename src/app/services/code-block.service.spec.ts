import { TestBed } from '@angular/core/testing';
import { CodeBlockService } from './code-block.service';

describe('CodeBlockService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('hides line numbers by default', () => {
    const service = TestBed.inject(CodeBlockService);

    expect(service.lineNumbers()).toBe(false);
  });

  it('toggles the option and persists it', () => {
    const service = TestBed.inject(CodeBlockService);

    service.toggleLineNumbers();

    expect(service.lineNumbers()).toBe(true);
    expect(JSON.parse(localStorage.getItem('markify.code-blocks')!)).toEqual({
      lineNumbers: true,
    });
  });

  it('restores the saved preference', () => {
    localStorage.setItem('markify.code-blocks', JSON.stringify({ lineNumbers: true }));
    TestBed.resetTestingModule();

    const service = TestBed.inject(CodeBlockService);

    expect(service.lineNumbers()).toBe(true);
  });

  it('ignores malformed stored preferences', () => {
    localStorage.setItem('markify.code-blocks', '{not json');
    TestBed.resetTestingModule();

    const service = TestBed.inject(CodeBlockService);

    expect(service.lineNumbers()).toBe(false);
  });
});
