import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { EditorRefService } from '../../services/editor-ref.service';
import { SearchService } from '../../services/search.service';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.css',
})
export class SearchBar {
  protected readonly search = inject(SearchService);
  protected readonly i18n = inject(I18nService);
  private readonly editorRef = inject(EditorRefService);
  private readonly injector = inject(Injector);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly replaceInput = viewChild<ElementRef<HTMLInputElement>>('replaceInput');

  protected readonly counter = computed(() => {
    if (this.search.invalidRegex() || this.search.query() === '') {
      return '';
    }
    if (this.search.total() === 0) {
      return this.i18n.t('search.noResults');
    }
    return `${this.search.activeIndex()} / ${this.search.total()}`;
  });

  constructor() {
    effect(() => {
      this.search.focusToken();
      if (!this.search.isOpen()) {
        return;
      }
      afterNextRender(
        () => {
          const target =
            this.search.focusTarget() === 'replace' ? this.replaceInput() : this.searchInput();
          const input = target?.nativeElement;
          input?.focus();
          input?.select();
        },
        { injector: this.injector },
      );
    });
  }

  protected onQuery(event: Event): void {
    this.search.setQuery((event.target as HTMLInputElement).value);
  }

  protected onReplacement(event: Event): void {
    this.search.setReplacement((event.target as HTMLInputElement).value);
  }

  protected close(): void {
    this.search.close();
    this.editorRef.textarea()?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (this.search.replaceVisible() && event.target === this.replaceInput()?.nativeElement) {
      this.search.replaceCurrent();
      return;
    }
    if (event.shiftKey) {
      this.search.previous();
    } else {
      this.search.next();
    }
  }
}
