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

  it('view menu contains a mode submenu with all modes', () => {
    const viewMenu = (
      component as unknown as { menus: () => ReturnType<TitleBar['menus']> }
    ).menus()[2];
    const modeItem = viewMenu.items.find((item) => item.submenu);
    expect(modeItem).toBeDefined();

    const submenu = modeItem!.submenu!;
    expect(submenu.items).toHaveLength(3);
    expect(submenu.items[0].checked).toBe(true);
    expect(submenu.items[1].checked).toBe(false);
    expect(submenu.items[2].checked).toBe(false);
  });

  it('disables edit actions when there is nothing to undo or edit', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const editMenu = menus[1];
    expect(editMenu.items[0].disabled).toBe(true);
    expect(editMenu.items[1].disabled).toBe(true);
    expect(editMenu.items[2].disabled).toBe(true);
    expect(editMenu.items[3].disabled).toBe(true);
    expect(editMenu.items[4].disabled).toBe(true);
  });

  it('file menu contains an export item disabled while no document is open', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const fileMenu = menus[0];
    const exportItem = fileMenu.items.find((item) => item.shortcut?.endsWith('E'));
    expect(exportItem).toBeDefined();
    expect(exportItem!.disabled).toBe(true);
  });
});
