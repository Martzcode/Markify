import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);

  private timeout: ReturnType<typeof setTimeout> | null = null;

  show(message: string, duration = 2000): void {
    this.message.set(message);
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => this.message.set(null), duration);
  }
}
