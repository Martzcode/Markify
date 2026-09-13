import { TestBed } from '@angular/core/testing';
import { TocService } from './toc.service';
import { ExplorerService } from './explorer.service';

describe('Panel exclusivity (Toc <-> Explorer)', () => {
  let toc: TocService;
  let explorer: ExplorerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toc = TestBed.inject(TocService);
    explorer = TestBed.inject(ExplorerService);
  });

  it('opening the TOC closes the explorer', () => {
    explorer.show();
    expect(explorer.visible()).toBe(true);

    toc.show();

    expect(toc.visible()).toBe(true);
    expect(explorer.visible()).toBe(false);
  });

  it('opening the explorer closes the TOC', () => {
    toc.show();
    expect(toc.visible()).toBe(true);

    explorer.show();

    expect(explorer.visible()).toBe(true);
    expect(toc.visible()).toBe(false);
  });

  it('toggling the TOC on closes the explorer and toggling off leaves it closed', () => {
    explorer.show();
    toc.toggle();
    expect(toc.visible()).toBe(true);
    expect(explorer.visible()).toBe(false);

    toc.toggle();
    expect(toc.visible()).toBe(false);
    expect(explorer.visible()).toBe(false);
  });
});
