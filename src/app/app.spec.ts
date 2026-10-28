import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { DocumentService } from './services/document.service';
import { TocService } from './services/toc.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Hello, Markify');
  });

  it('hides the table of contents when the document is closed', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const documentService = TestBed.inject(DocumentService);
    const toc = TestBed.inject(TocService);

    documentService.isOpen.set(true);
    toc.show();
    fixture.detectChanges();
    expect(toc.visible()).toBe(true);

    documentService.isOpen.set(false);
    fixture.detectChanges();
    expect(toc.visible()).toBe(false);
  });
});
