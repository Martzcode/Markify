import { TestBed } from '@angular/core/testing';
import { UnsavedChangesService } from './unsaved-changes.service';

describe('UnsavedChangesService', () => {
  let service: UnsavedChangesService;

  beforeEach(() => {
    service = TestBed.inject(UnsavedChangesService);
  });

  it('opens the dialog and resolves the selected choice', async () => {
    const pending = service.confirm();
    expect(service.isOpen()).toBe(true);

    service.resolve('save');

    await expect(pending).resolves.toBe('save');
    expect(service.isOpen()).toBe(false);
  });

  it('refuses a second concurrent confirmation', async () => {
    const pending = service.confirm();

    await expect(service.confirm()).resolves.toBe('cancel');

    service.resolve('discard');
    await expect(pending).resolves.toBe('discard');
  });

  it('ignores a resolution when no dialog is open', () => {
    service.resolve('cancel');

    expect(service.isOpen()).toBe(false);
  });
});
