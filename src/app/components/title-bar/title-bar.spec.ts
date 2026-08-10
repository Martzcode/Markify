import { TestBed } from '@angular/core/testing';
import { TitleBar } from './title-bar';

describe('TitleBar', () => {
  let component: TitleBar;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TitleBar],
    }).compileComponents();
    const fixture = TestBed.createComponent(TitleBar);
    component = fixture.componentInstance;
  });

  it('view menu contains a mode submenu with read and edit modes', () => {
    const viewMenu = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus()[2];
    const modeItem = viewMenu.items.find((item) => item.submenu);
    expect(modeItem).toBeDefined();

    const submenu = modeItem!.submenu!;
    expect(submenu.items).toHaveLength(2);
    expect(submenu.items[0].checked).toBe(true);
    expect(submenu.items[1].checked).toBe(false);
  });
});
