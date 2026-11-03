import { Injectable, OnDestroy, inject } from '@angular/core';
import { getCurrentWindow, type CloseRequestedEvent } from '@tauri-apps/api/window';
import { SessionService } from './session.service';
import { TabsService } from './tabs.service';

/**
 * Intercepte la fermeture de la fenêtre (croix, Alt+F4, menu Quitter) pour
 * laisser une chance à l'utilisateur d'enregistrer ses modifications.
 *
 * Le wrapper `onCloseRequested` de Tauri attend la fin du gestionnaire avant
 * de détruire la fenêtre : on peut donc ouvrir le dialogue puis appeler
 * `preventDefault()` si l'utilisateur annule. Le `destroy()` interne du
 * wrapper nécessite la permission `core:window:allow-destroy`.
 */
@Injectable({ providedIn: 'root' })
export class WindowCloseGuardService implements OnDestroy {
  private readonly tabs = inject(TabsService);
  private readonly session = inject(SessionService);

  private unlisten: (() => void) | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      const win = getCurrentWindow();
      this.unlisten = await win.onCloseRequested((event) => this.onCloseRequested(event));
    } catch {
      // Hors environnement Tauri (navigateur, tests) : aucun garde-fou possible.
    }
  }

  ngOnDestroy(): void {
    this.unlisten?.();
    this.unlisten = null;
  }

  private async onCloseRequested(event: CloseRequestedEvent): Promise<void> {
    const canClose = await this.tabs.confirmCloseAll();
    if (!canClose) {
      event.preventDefault();
      return;
    }
    // `destroy()` ne déclenche pas `beforeunload` : on force l'écriture.
    this.session.flush();
  }
}
