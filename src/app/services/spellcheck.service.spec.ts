import { TestBed } from '@angular/core/testing';
import { SpellcheckService } from './spellcheck.service';

describe('SpellcheckService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('enables spellcheck with the system language by default', () => {
    const service = TestBed.inject(SpellcheckService);

    expect(service.enabled()).toBe(true);
    expect(service.language()).toBe('auto');
    expect(service.langAttribute()).toBeNull();
  });

  it('toggles spellcheck and persists the choice', () => {
    const service = TestBed.inject(SpellcheckService);

    service.toggle();

    expect(service.enabled()).toBe(false);
    expect(JSON.parse(localStorage.getItem('markify.spellcheck')!)).toEqual({
      enabled: false,
      language: 'auto',
    });
  });

  it('sets the language and exposes it as a lang attribute', () => {
    const service = TestBed.inject(SpellcheckService);

    service.setLanguage('fr');

    expect(service.language()).toBe('fr');
    expect(service.langAttribute()).toBe('fr');
    expect(JSON.parse(localStorage.getItem('markify.spellcheck')!)).toEqual({
      enabled: true,
      language: 'fr',
    });
  });

  it('restores the saved preferences', () => {
    localStorage.setItem('markify.spellcheck', JSON.stringify({ enabled: false, language: 'de' }));
    TestBed.resetTestingModule();

    const service = TestBed.inject(SpellcheckService);

    expect(service.enabled()).toBe(false);
    expect(service.langAttribute()).toBe('de');
  });

  it('falls back to defaults for malformed or unknown values', () => {
    localStorage.setItem('markify.spellcheck', '{not json');
    TestBed.resetTestingModule();
    expect(TestBed.inject(SpellcheckService).enabled()).toBe(true);

    localStorage.setItem(
      'markify.spellcheck',
      JSON.stringify({ enabled: 'yes', language: 'klingon' }),
    );
    TestBed.resetTestingModule();

    const service = TestBed.inject(SpellcheckService);

    expect(service.enabled()).toBe(true);
    expect(service.language()).toBe('auto');
  });
});
