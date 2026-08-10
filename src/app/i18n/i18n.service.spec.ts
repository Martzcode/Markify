import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(I18nService);
  });

  it('defaults to English when no language is stored', () => {
    expect(service.currentLang()).toBe('en');
  });

  it('translates keys in every supported language', () => {
    service.setLang('fr');
    expect(service.t('menu.file')).toBe('Fichier');
    expect(service.t('menu.language')).toBe('Langue');

    service.setLang('de');
    expect(service.t('menu.file')).toBe('Datei');
    expect(service.t('welcome.hello')).toBe('Hallo, Markify!');

    service.setLang('es');
    expect(service.t('menu.file')).toBe('Archivo');
    expect(service.t('menu.edit.undo')).toBe('Deshacer');

    service.setLang('en');
    expect(service.t('menu.file')).toBe('File');
    expect(service.t('welcome.hello')).toBe('Hello, Markify!');
  });

  it('persists the language choice', () => {
    service.setLang('de');
    const fresh = new I18nService();
    expect(fresh.currentLang()).toBe('de');
  });

  it('falls back to the key when translation is missing', () => {
    expect(service.t('app.name')).toBe('Markify');
  });
});
