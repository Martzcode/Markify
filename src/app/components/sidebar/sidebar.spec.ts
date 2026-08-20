import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DocumentService } from '../../services/document.service';
import { ExplorerService } from '../../services/explorer.service';
import { ExplorerNode, Sidebar } from './sidebar';

describe('Sidebar', () => {
  let explorer: ExplorerService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar, ExplorerNode],
    }).compileComponents();
    explorer = TestBed.inject(ExplorerService);
  });

  it('renders the folder name and tree entries', () => {
    explorer.visible.set(true);
    explorer.rootPath.set('/workspace');
    explorer.rootEntries.set([
      { name: 'docs', path: '/workspace/docs', isDir: true, children: [] },
      { name: 'README.md', path: '/workspace/README.md', isDir: false, children: [] },
    ]);
    explorer.expanded.set(new Set(['/workspace']));

    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('workspace');
    expect(el.textContent).toContain('docs');
    expect(el.textContent).toContain('README.md');
  });

  it('renders children of an expanded directory', () => {
    explorer.visible.set(true);
    explorer.rootPath.set('/workspace');
    explorer.rootEntries.set([
      { name: 'docs', path: '/workspace/docs', isDir: true, children: [] },
    ]);
    explorer.expanded.set(new Set(['/workspace', '/workspace/docs']));
    (explorer as unknown as { childrenCache: Map<string, unknown[]> }).childrenCache.set(
      '/workspace/docs',
      [{ name: 'guide.md', path: '/workspace/docs/guide.md', isDir: false, children: [] }],
    );

    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('guide.md');
  });

  it('opens a file entry from the tree', async () => {
    explorer.visible.set(true);
    explorer.rootPath.set('/workspace');
    explorer.rootEntries.set([
      { name: 'README.md', path: '/workspace/README.md', isDir: false, children: [] },
    ]);
    explorer.expanded.set(new Set(['/workspace']));

    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const docService = TestBed.inject(DocumentService);
    const openPath = vi.spyOn(docService, 'openPath').mockResolvedValue();

    const node = (fixture.nativeElement as HTMLElement).querySelector('.node') as HTMLElement;
    node.click();
    await fixture.whenStable();

    expect(openPath).toHaveBeenCalledWith('/workspace/README.md');
    expect(explorer.selectedPath()).toBe('/workspace/README.md');
  });

  it('expands a directory entry when clicked', async () => {
    explorer.visible.set(true);
    explorer.rootPath.set('/workspace');
    explorer.rootEntries.set([
      { name: 'docs', path: '/workspace/docs', isDir: true, children: [] },
    ]);
    explorer.expanded.set(new Set(['/workspace']));

    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const node = (fixture.nativeElement as HTMLElement).querySelector('.node') as HTMLElement;
    node.click();
    await fixture.whenStable();

    expect(explorer.expanded().has('/workspace/docs')).toBe(true);
  });
});
