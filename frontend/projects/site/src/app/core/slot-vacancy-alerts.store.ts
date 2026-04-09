import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'nexago-slot-vacancy-alerts';

export interface SlotVacancyAlert {
  arenaId: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm */
  time: string;
}

function alertKey(a: SlotVacancyAlert): string {
  return `${a.arenaId}|${a.date}|${a.time}`;
}

@Injectable({ providedIn: 'root' })
export class SlotVacancyAlertsStore {
  readonly alerts = signal<readonly SlotVacancyAlert[]>([]);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const list = parsed.filter(
              (x): x is SlotVacancyAlert =>
                typeof x === 'object' &&
                x !== null &&
                typeof (x as SlotVacancyAlert).arenaId === 'string' &&
                typeof (x as SlotVacancyAlert).date === 'string' &&
                typeof (x as SlotVacancyAlert).time === 'string',
            );
            this.alerts.set(list);
          }
        }
      } catch {
        /* ignore */
      }
    }

    effect(() => {
      const list = this.alerts();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...list]));
      }
    });
  }

  has(arenaId: string, date: string, time: string): boolean {
    const k = alertKey({ arenaId, date, time });
    return this.alerts().some((a) => alertKey(a) === k);
  }

  subscribe(entry: SlotVacancyAlert): void {
    const k = alertKey(entry);
    this.alerts.update((current) => {
      if (current.some((a) => alertKey(a) === k)) {
        return current;
      }
      return [...current, entry];
    });
  }

  unsubscribe(arenaId: string, date: string, time: string): void {
    const k = alertKey({ arenaId, date, time });
    this.alerts.update((current) => current.filter((a) => alertKey(a) !== k));
  }
}
