import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'nexago-favorite-arenas';

/**
 * Favoritos com persistência (retenção / comparação). IDs das arenas.
 */
@Injectable({ providedIn: 'root' })
export class ArenaFavoritesStore {
  /** Conjunto imutável trocado a cada update — seguro com OnPush + effect. */
  readonly ids = signal<ReadonlySet<string>>(new Set());

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            this.ids.set(new Set(parsed.filter((x): x is string => typeof x === 'string')));
          }
        }
      } catch {
        /* ignore */
      }
    }

    effect(() => {
      const s = this.ids();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
      }
    });
  }

  has(id: string): boolean {
    return this.ids().has(id);
  }

  toggle(id: string): void {
    this.ids.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
}
