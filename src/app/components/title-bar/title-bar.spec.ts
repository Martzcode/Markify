import { TestBed } from '@angular/core/testing';
import { TitleBar } from './title-bar';
import { ThemeService } from '../../services/theme.service';

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

  it('file menu contains an open folder item', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const fileMenu = menus[0];
    const openFolder = fileMenu.items.find((item) => item.shortcut?.endsWith('Shift+O'));
    expect(openFolder).toBeDefined();
    expect(openFolder!.label).toContain('Open Folder');
  });

  it('file menu contains a save-as item disabled while no document is open', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const fileMenu = menus[0];
    const saveAs = fileMenu.items.find((item) => item.shortcut?.endsWith('Shift+S'));
    expect(saveAs).toBeDefined();
    expect(saveAs!.label).toContain('Save As');
    expect(saveAs!.disabled).toBe(true);

    const saveCopy = fileMenu.items.find((item) => item.label.includes('Copy'));
    expect(saveCopy).toBeDefined();
    expect(saveCopy!.disabled).toBe(true);
  });

  it('file menu contains a close-folder item disabled while no folder is open', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const fileMenu = menus[0];
    const closeFolder = fileMenu.items.find((item) => item.label.includes('Close Folder'));
    expect(closeFolder).toBeDefined();
    expect(closeFolder!.disabled).toBe(true);
  });

  it('view menu contains a toggle explorer item', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const viewMenu = menus[2];
    const item = viewMenu.items.find((entry) => entry.shortcut?.endsWith('B'));
    expect(item).toBeDefined();
    expect(item!.label).toContain('Explorer');
  });

  it('view menu toggles code line numbers', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const viewMenu = menus[2];
    const item = viewMenu.items.find((entry) => entry.label.includes('Code line numbers'));
    expect(item).toBeDefined();
    expect(item!.checked).toBe(false);

    item!.action!();
    const updated = (
      component as unknown as { menus: () => ReturnType<TitleBar['menus']> }
    ).menus()[2];
    expect(updated.items.find((entry) => entry.label.includes('Code line numbers'))!.checked).toBe(
      true,
    );
  });

  it('view menu toggles raw HTML rendering, disabled by default', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const viewMenu = menus[2];
    const item = viewMenu.items.find((entry) => entry.label.includes('raw HTML'));
    expect(item).toBeDefined();
    expect(item!.checked).toBe(false);

    item!.action!();
    const updated = (
      component as unknown as { menus: () => ReturnType<TitleBar['menus']> }
    ).menus()[2];
    expect(updated.items.find((entry) => entry.label.includes('raw HTML'))!.checked).toBe(true);
  });

  it('offers light, dark and auto theme buttons before the window controls', () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(TitleBar);
    fixture.detectChanges();

    const right = fixture.nativeElement.querySelector('.titlebar-right') as HTMLElement;
    const themeSwitch = right.querySelector('.theme-switch') as HTMLElement;
    const buttons = Array.from(themeSwitch.querySelectorAll('.theme-btn')) as HTMLButtonElement[];

    expect(right.children[0]).toBe(themeSwitch);
    expect(buttons).toHaveLength(3);
    expect(buttons[0].querySelector('.fa-sun')).not.toBeNull();
    expect(buttons[1].querySelector('.fa-moon')).not.toBeNull();
    expect(buttons[2].querySelector('.fa-circle-half-stroke')).not.toBeNull();

    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('auto');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');

    buttons[0].click();
    fixture.detectChanges();
    expect(theme.preference()).toBe('light');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');

    buttons[1].click();
    fixture.detectChanges();
    expect(theme.preference()).toBe('dark');

    buttons[2].click();
    fixture.detectChanges();
    expect(theme.preference()).toBe('auto');
  });
});
