import { TestBed } from '@angular/core/testing';
import { SecurityService } from './security.service';

describe('SecurityService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps raw HTML disabled by default', () => {
    const service = TestBed.inject(SecurityService);

    expect(service.allowRawHtml()).toBe(false);
  });

  it('toggles the option and persists it', () => {
    const service = TestBed.inject(SecurityService);

    service.toggleRawHtml();

    expect(service.allowRawHtml()).toBe(true);
    expect(JSON.parse(localStorage.getItem('markify.security')!)).toEqual({
      allowRawHtml: true,
    });
  });

  it('restores the saved preference', () => {
    localStorage.setItem('markify.security', JSON.stringify({ allowRawHtml: true }));
    TestBed.resetTestingModule();

    const service = TestBed.inject(SecurityService);

    expect(service.allowRawHtml()).toBe(true);
  });

  it('ignores malformed stored preferences', () => {
    localStorage.setItem('markify.security', '{not json');
    TestBed.resetTestingModule();

    const service = TestBed.inject(SecurityService);

    expect(service.allowRawHtml()).toBe(false);
  });
});
