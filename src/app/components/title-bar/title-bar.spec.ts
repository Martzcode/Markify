import { TestBed } from '@angular/core/testing';
import { TitleBar } from './title-bar';
import { ThemeService } from '../../services/theme.service';
import { I18nService } from '../../i18n/i18n.service';
import { DocumentService } from '../../services/document.service';

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

  it('view menu toggles spellcheck, enabled by default', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const viewMenu = menus[2];
    const item = viewMenu.items.find((entry) => entry.label.includes('Check spelling'));
    expect(item).toBeDefined();
    expect(item!.checked).toBe(true);

    item!.action!();
    const updated = (
      component as unknown as { menus: () => ReturnType<TitleBar['menus']> }
    ).menus()[2];
    expect(updated.items.find((entry) => entry.label.includes('Check spelling'))!.checked).toBe(
      false,
    );
  });

  it('view menu offers the spellcheck languages and remembers the choice', () => {
    const menus = (component as unknown as { menus: () => ReturnType<TitleBar['menus']> }).menus();
    const submenuItem = menus[2].items.find((entry) => entry.label.includes('Spellcheck language'));
    expect(submenuItem).toBeDefined();
    expect(submenuItem!.submenu!.items).toHaveLength(5);
    expect(submenuItem!.submenu!.items[0].label).toContain('Automatic');
    expect(submenuItem!.submenu!.items[0].checked).toBe(true);

    const french = submenuItem!.submenu!.items.find((entry) => entry.label === 'Français');
    expect(french).toBeDefined();
    french!.action!();

    const updated = (
      component as unknown as { menus: () => ReturnType<TitleBar['menus']> }
    ).menus()[2];
    const updatedSubmenu = updated.items.find((entry) =>
      entry.label.includes('Spellcheck language'),
    );
    expect(
      updatedSubmenu!.submenu!.items.find((entry) => entry.label === 'Français')!.checked,
    ).toBe(true);
  });

  it('closes an open submenu when the pointer moves to another menu or item', () => {
    const fixture = TestBed.createComponent(TitleBar);
    fixture.detectChanges();
    const topMenus = Array.from(fixture.nativeElement.querySelectorAll('.menu')) as HTMLElement[];

    const openViewMenu = () => {
      topMenus[2]
        .querySelector('.menu-label')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
    };
    const hoverModeSubmenu = () => {
      (fixture.nativeElement.querySelector('.menu-item-submenu') as HTMLElement).dispatchEvent(
        new MouseEvent('mouseenter'),
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.menu-dropdown-sub')).not.toBeNull();
    };

    openViewMenu();
    hoverModeSubmenu();

    // Un autre élément du même menu referme le sous-menu.
    const sibling = fixture.nativeElement.querySelector(
      '.menu-dropdown > button.menu-item',
    ) as HTMLElement;
    sibling.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.menu-dropdown-sub')).toBeNull();

    hoverModeSubmenu();

    // Changer de menu principal referme aussi le sous-menu.
    topMenus[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.menu-dropdown-sub')).toBeNull();
    expect(
      (fixture.componentInstance as unknown as { openSubmenu: () => string | null }).openSubmenu(),
    ).toBeNull();
  });

  it('offers a single cycling view-mode button next to the theme switch', () => {
    localStorage.clear();
    const document = TestBed.inject(DocumentService);
    document.setMode('read');
    const fixture = TestBed.createComponent(TitleBar);
    fixture.detectChanges();

    const right = fixture.nativeElement.querySelector('.titlebar-right') as HTMLElement;
    const themeSwitch = right.querySelector('.theme-switch') as HTMLElement;
    const modeSwitch = right.querySelector('.mode-switch') as HTMLElement;
    expect(modeSwitch).not.toBeNull();
    expect(right.children[0]).toBe(themeSwitch);
    expect(right.children[1]).toBe(modeSwitch);

    const i18n = TestBed.inject(I18nService);
    const button = modeSwitch.querySelector('.mode-btn') as HTMLButtonElement;

    expect(document.mode()).toBe('read');
    expect(button.querySelector('.fa-book-open')).not.toBeNull();
    expect(button.getAttribute('title')).toContain(i18n.t('menu.view.readMode'));
    expect(button.getAttribute('title')).toContain(i18n.t('menu.view.editMode'));

    button.click();
    fixture.detectChanges();
    expect(document.mode()).toBe('edit');
    expect(button.querySelector('.fa-pen-to-square')).not.toBeNull();
    expect(button.getAttribute('title')).toContain(i18n.t('menu.view.hybridMode'));

    button.click();
    fixture.detectChanges();
    expect(document.mode()).toBe('hybrid');
    expect(button.querySelector('.fa-table-columns')).not.toBeNull();

    button.click();
    fixture.detectChanges();
    expect(document.mode()).toBe('read');
    expect(button.querySelector('.fa-book-open')).not.toBeNull();
  });

  it('offers a single cycling theme button before the window controls', () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(TitleBar);
    fixture.detectChanges();

    const right = fixture.nativeElement.querySelector('.titlebar-right') as HTMLElement;
    const themeSwitch = right.querySelector('.theme-switch') as HTMLElement;
    const buttons = themeSwitch.querySelectorAll('.theme-btn') as NodeListOf<HTMLButtonElement>;

    expect(right.children[0]).toBe(themeSwitch);
    expect(buttons).toHaveLength(1);

    const theme = TestBed.inject(ThemeService);
    const i18n = TestBed.inject(I18nService);
    const button = buttons[0];
    expect(theme.preference()).toBe('auto');
    expect(button.querySelector('.fa-circle-half-stroke')).not.toBeNull();
    expect(button.getAttribute('title')).toContain(i18n.t('theme.auto'));

    button.click();
    fixture.detectChanges();
    expect(theme.preference()).toBe('light');
    expect(button.querySelector('.fa-sun')).not.toBeNull();
    expect(button.getAttribute('title')).toContain(i18n.t('theme.light'));

    button.click();
    fixture.detectChanges();
    expect(theme.preference()).toBe('dark');
    expect(button.querySelector('.fa-moon')).not.toBeNull();
    expect(button.getAttribute('title')).toContain(i18n.t('theme.dark'));

    button.click();
    fixture.detectChanges();
    expect(theme.preference()).toBe('auto');
    expect(button.querySelector('.fa-circle-half-stroke')).not.toBeNull();
  });
});
