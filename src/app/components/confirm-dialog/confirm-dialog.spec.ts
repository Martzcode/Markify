import { TestBed } from '@angular/core/testing';
import { ConfirmService } from '../../services/confirm.service';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let service: ConfirmService;

  const options = {
    title: 'Close the folder?',
    message: 'The folder and the open document will be closed.',
    confirmLabel: 'Close all',
    cancelLabel: 'Cancel',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialog],
    }).compileComponents();
    service = TestBed.inject(ConfirmService);
  });

  it('renders the provided labels and accepts', async () => {
    const pending = service.confirm(options);
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Close the folder?');
    expect(el.textContent).toContain('Close all');
    expect(el.textContent).toContain('Cancel');

    (el.querySelector('.confirm-button-primary') as HTMLElement).click();

    await expect(pending).resolves.toBe(true);
  });

  it('cancels when the backdrop is clicked', async () => {
    const pending = service.confirm(options);
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.confirm-backdrop')!.click();

    await expect(pending).resolves.toBe(false);
  });

  it('cancels with Escape', async () => {
    const pending = service.confirm(options);
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await expect(pending).resolves.toBe(false);
  });
});
