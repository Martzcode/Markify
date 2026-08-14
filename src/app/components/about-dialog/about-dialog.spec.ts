import { TestBed } from '@angular/core/testing';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AboutDialog, APP_DEVELOPER, APP_PROFILE } from './about-dialog';
import { AboutDialogService } from '../../services/about-dialog.service';

describe('AboutDialog', () => {
  let service: AboutDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutDialog],
    }).compileComponents();
    service = TestBed.inject(AboutDialogService);
    service.open();
  });

  it('displays the developer pseudonym', () => {
    const fixture = TestBed.createComponent(AboutDialog);
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector('.about-developer-name');
    expect(name.textContent).toContain(APP_DEVELOPER);
    expect(name.textContent).toContain('Martzcode');
  });

  it('displays the app version', async () => {
    const fixture = TestBed.createComponent(AboutDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const version = fixture.nativeElement.querySelector('.about-version');
    expect(version.textContent).toContain('9.9.9');
  });

  it('opens the developer profile on click', () => {
    const fixture = TestBed.createComponent(AboutDialog);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.about-developer-name');
    expect(link.getAttribute('href')).toBe(APP_PROFILE);
    link.click();

    expect(openUrl).toHaveBeenCalledWith(APP_PROFILE);
  });

  it('closes when the close button is clicked', () => {
    const fixture = TestBed.createComponent(AboutDialog);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.about-close').click();

    expect(service.isOpen()).toBe(false);
  });

  it('closes on Escape', () => {
    const fixture = TestBed.createComponent(AboutDialog);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(service.isOpen()).toBe(false);
  });
});
