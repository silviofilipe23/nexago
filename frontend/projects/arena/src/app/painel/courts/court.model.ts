/** Espelha `nexago_app/.../arena/data/court_service.dart` + `ArenaCourtStatus` — schema real
 *  de `arenas/{arenaId}/courts/{courtId}`. */

export type ArenaCourtStatus = 'active' | 'maintenance';

export const ARENA_COURT_STATUS_LABEL: Record<ArenaCourtStatus, string> = {
  active: 'Ativa',
  maintenance: 'Em manutenção',
};

export interface ArenaCourt {
  id: string;
  name: string;
  /** Esportes em CÓDIGO do catálogo (rótulo legado já convertido na leitura). */
  types: string[];
  /** O que as telas exibem (rótulo do catálogo; fora dele, o valor cru). */
  typeLabels: string[];
  status: ArenaCourtStatus;
  basePricePerHourReais: number | null;
}
