import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let service: ConfirmService;

  const options = {
    title: 'Close the folder?',
    message: 'The folder will be closed.',
    confirmLabel: 'Close all',
    cancelLabel: 'Cancel',
  };

  beforeEach(() => {
    service = TestBed.inject(ConfirmService);
  });

  it('opens the dialog and resolves true when accepted', async () => {
    const pending = service.confirm(options);

    expect(service.isOpen()).toBe(true);
    expect(service.options()).toEqual(options);

    service.accept();

    await expect(pending).resolves.toBe(true);
    expect(service.isOpen()).toBe(false);
    expect(service.options()).toBeNull();
  });

  it('resolves false when cancelled', async () => {
    const pending = service.confirm(options);

    service.cancel();

    await expect(pending).resolves.toBe(false);
    expect(service.isOpen()).toBe(false);
  });

  it('refuses a second concurrent confirmation', async () => {
    const pending = service.confirm(options);

    await expect(service.confirm(options)).resolves.toBe(false);

    service.accept();
    await expect(pending).resolves.toBe(true);
  });

  it('ignores a resolution when no dialog is open', () => {
    service.accept();
    service.cancel();

    expect(service.isOpen()).toBe(false);
    expect(service.options()).toBeNull();
  });
});
