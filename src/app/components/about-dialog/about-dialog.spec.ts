import { TestBed } from '@angular/core/testing';
import { AboutDialog, APP_DEVELOPER } from './about-dialog';
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
