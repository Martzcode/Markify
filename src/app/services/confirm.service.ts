import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * État du dialogue de confirmation générique (deux boutons : confirmer ou
 * annuler). Le composant `ConfirmDialog` lit `isOpen`/`options` et résout la
 * promesse via `accept` ou `cancel`.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly isOpen = signal(false);
  readonly options = signal<ConfirmOptions | null>(null);

  private resolver: ((confirmed: boolean) => void) | null = null;

  /**
   * Ouvre le dialogue et attend la réponse. Si un dialogue est déjà ouvert,
   * renvoie `false` pour éviter d'empiler deux confirmations concurrentes.
   */
  confirm(options: ConfirmOptions): Promise<boolean> {
    if (this.resolver !== null) {
      return Promise.resolve(false);
    }
    this.options.set(options);
    this.isOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  accept(): void {
    this.settle(true);
  }

  cancel(): void {
    this.settle(false);
  }

  private settle(confirmed: boolean): void {
    const resolver = this.resolver;
    if (resolver === null) {
      return;
    }
    this.resolver = null;
    this.isOpen.set(false);
    this.options.set(null);
    resolver(confirmed);
  }
}
