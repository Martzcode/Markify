import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EditorRefService {
  readonly textarea = signal<HTMLTextAreaElement | null>(null);
}
