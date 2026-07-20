import { Injectable, computed, signal } from '@angular/core';
import { BR_STATES, type BrState } from './br-locations.model';

const MUNICIPALITIES_ASSET_PATH = '/data/br-municipalities-by-uf.json';

@Injectable({ providedIn: 'root' })
export class BrLocationsService {
  readonly states: readonly BrState[] = BR_STATES;

  private readonly citiesByUf = signal<Record<string, string[]> | null>(null);
  readonly loaded = computed(() => this.citiesByUf() !== null);

  readonly ready: Promise<void> = fetch(MUNICIPALITIES_ASSET_PATH)
    .then((res) => res.json() as Promise<Record<string, string[]>>)
    .then((data) => this.citiesByUf.set(data))
    .catch(() => this.citiesByUf.set({}));

  citiesFor(uf: string): string[] {
    if (!uf) return [];
    return this.citiesByUf()?.[uf] ?? [];
  }
}
