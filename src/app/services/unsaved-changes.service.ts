import { Injectable, signal } from '@angular/core';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

/**
 * État du dialogue de confirmation affiché lorsqu'un document contient des
 * modifications non enregistrées. Le composant `UnsavedChangesDialog` lit
 * `isOpen` et résout la promesse via `resolve`.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesService {
  readonly isOpen = signal(false);

  private resolver: ((choice: UnsavedChoice) => void) | null = null;

  /**
   * Ouvre le dialogue et attend le choix de l'utilisateur.
   * Si un dialogue est déjà ouvert, renvoie « cancel » pour éviter d'empiler
   * deux confirmations concurrentes.
   */
  confirm(): Promise<UnsavedChoice> {
    if (this.resolver !== null) {
      return Promise.resolve('cancel');
    }
    this.isOpen.set(true);
    return new Promise<UnsavedChoice>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(choice: UnsavedChoice): void {
    const resolver = this.resolver;
    if (resolver === null) {
      return;
    }
    this.resolver = null;
    this.isOpen.set(false);
    resolver(choice);
  }
}
