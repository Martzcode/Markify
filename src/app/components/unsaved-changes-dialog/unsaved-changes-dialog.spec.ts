import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentService } from '../../services/document.service';
import { UnsavedChangesService } from '../../services/unsaved-changes.service';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';

describe('UnsavedChangesDialog', () => {
  let fixture: ComponentFixture<UnsavedChangesDialog>;
  let unsaved: UnsavedChangesService;
  let document: DocumentService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UnsavedChangesDialog] }).compileComponents();
    unsaved = TestBed.inject(UnsavedChangesService);
    document = TestBed.inject(DocumentService);
    fixture = TestBed.createComponent(UnsavedChangesDialog);
  });

  it('shows the name of the modified file', () => {
    document.filePath.set('/tmp/notes.md');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('notes.md');
  });

  it('falls back to "untitled" for a new document', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Untitled');
  });

  it('resolves the save choice from the primary button', async () => {
    fixture.detectChanges();
    const pending = unsaved.confirm();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.unsaved-button-primary')!.click();

    await expect(pending).resolves.toBe('save');
  });

  it('resolves the discard choice', async () => {
    fixture.detectChanges();
    const pending = unsaved.confirm();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.unsaved-button-danger')!.click();

    await expect(pending).resolves.toBe('discard');
  });

  it('cancels when the backdrop is clicked', async () => {
    fixture.detectChanges();
    const pending = unsaved.confirm();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLElement>('.unsaved-backdrop')!.click();

    await expect(pending).resolves.toBe('cancel');
  });
});
