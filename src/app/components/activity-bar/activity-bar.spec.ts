import { TestBed } from '@angular/core/testing';
import { ExplorerService } from '../../services/explorer.service';
import { ActivityBar } from './activity-bar';

describe('ActivityBar', () => {
  let explorer: ExplorerService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityBar],
    }).compileComponents();
    explorer = TestBed.inject(ExplorerService);
  });

  it('renders the folder icon', () => {
    const fixture = TestBed.createComponent(ActivityBar);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.activity-icon')).not.toBeNull();
  });

  it('toggles the explorer on click', () => {
    explorer.visible.set(false);
    const fixture = TestBed.createComponent(ActivityBar);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.activity-icon') as HTMLElement;
    button.click();
    fixture.detectChanges();

    expect(explorer.visible()).toBe(true);
  });

  it('marks the icon active when the explorer is visible', () => {
    explorer.visible.set(true);
    const fixture = TestBed.createComponent(ActivityBar);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.activity-icon') as HTMLElement;
    expect(button.classList.contains('activity-icon-active')).toBe(true);
  });
});
