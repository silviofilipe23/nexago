import { Injectable, signal } from '@angular/core';
import type { LatLngBounds } from 'leaflet';

/** Limites do mapa em formato simples (serializável); lista filtra pelo viewport. */
export interface ArenaMapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Estado compartilhado descoberta estilo marketplace: seleção, hover lista↔mapa, viewport.
 */
@Injectable({ providedIn: 'root' })
export class ArenaDiscoveryStore {
  readonly selectedArenaId = signal<string | null>(null);
  readonly hoveredArenaId = signal<string | null>(null);
  readonly mapBounds = signal<ArenaMapBounds | null>(null);

  selectArena(id: string | null): void {
    this.selectedArenaId.set(id);
  }

  hoverArena(id: string | null): void {
    this.hoveredArenaId.set(id);
  }

  setMapBounds(bounds: LatLngBounds | null): void {
    if (!bounds) {
      this.mapBounds.set(null);
      return;
    }
    this.mapBounds.set({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  }
}
