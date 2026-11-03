import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { vi } from 'vitest';
import { DocumentService } from '../../services/document.service';
import { TabsService } from '../../services/tabs.service';
import { TabsBar } from './tabs-bar';

describe('TabsBar', () => {
  let tabs: TabsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsBar],
    }).compileComponents();
    tabs = TestBed.inject(TabsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(TabsBar);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one tab per open document', async () => {
    vi.mocked(invoke).mockResolvedValue('# A');
    await tabs.openPath('/work/a.md');
    await tabs.openPath('/work/b.md');
    tabs.newTab();

    const fixture = createFixture();
    const elements = fixture.nativeElement.querySelectorAll('.tab');

    expect(elements).toHaveLength(3);
    expect(elements[0].textContent).toContain('a.md');
    expect(elements[1].textContent).toContain('b.md');
    expect(elements[2].textContent).toContain('Untitled');
    expect(elements[2].classList.contains('active')).toBe(true);
  });

  it('shows the modified indicator of a dirty tab', () => {
    tabs.newTab();
    const document = TestBed.inject(DocumentService);
    document.setContent('draft');
    TestBed.flushEffects();

    const fixture = createFixture();

    expect(fixture.nativeElement.querySelector('.tab-dirty')).not.toBeNull();
  });

  it('activates a tab when it is clicked', async () => {
    vi.mocked(invoke).mockResolvedValue('# A');
    await tabs.openPath('/work/a.md');
    await tabs.openPath('/work/b.md');
    const first = tabs.tabs()[0];

    const fixture = createFixture();
    (fixture.nativeElement.querySelector('.tab') as HTMLElement).click();

    expect(tabs.activeId()).toBe(first.id);
  });

  it('closes a tab from its close button', () => {
    tabs.newTab();
    const id = tabs.activeId()!;
    const spy = vi.spyOn(tabs, 'closeTab').mockResolvedValue(true);

    const fixture = createFixture();
    (fixture.nativeElement.querySelector('.tab-close') as HTMLElement).click();

    expect(spy).toHaveBeenCalledWith(id);
  });

  it('closes a tab with a middle click', () => {
    tabs.newTab();
    const id = tabs.activeId()!;
    const spy = vi.spyOn(tabs, 'closeTab').mockResolvedValue(true);

    const fixture = createFixture();
    const tab = fixture.nativeElement.querySelector('.tab') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));

    expect(spy).toHaveBeenCalledWith(id);
  });

  it('reorders tabs with drag and drop', () => {
    tabs.newTab();
    tabs.newTab();
    const ids = tabs.tabs().map((tab) => tab.id);
    const fixture = createFixture();
    const component = fixture.componentInstance as unknown as {
      onDragStart(event: DragEvent, index: number): void;
      onDrop(event: DragEvent, index: number): void;
    };
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      getData: vi.fn(() => '0'),
    } as unknown as DataTransfer;
    const event = {
      dataTransfer,
      preventDefault: vi.fn(),
    } as unknown as DragEvent;

    component.onDragStart(event, 0);
    component.onDrop(event, 1);

    expect(tabs.tabs().map((tab) => tab.id)).toEqual([ids[1], ids[0]]);
  });
});
