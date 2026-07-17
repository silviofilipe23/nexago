/** Espelha `leagues/{id}` (top-level), filtrado por `managerId == uid`. Etapas ficam embutidas
 *  no array `stages` do próprio doc da liga (`league_create_mapper.dart`/
 *  `league_stage_tournament_factory.dart`) — cada etapa referencia no máximo 1 torneio real
 *  (`tournamentIds: [tournamentId]`, sempre gravado com 1 elemento pelo Flutter hoje). Ver
 *  `leagues-repository.ts` pro mapeamento de campos. */

export interface OrganizerLeagueStage {
  id: string;
  name: string;
  tournamentId: string | null;
  startAt: Date | null;
}

export interface OrganizerLeague {
  id: string;
  name: string;
  sportLabel: string;
  seasonLabel: string | null;
  city: string | null;
  /** Capa da liga (`coverUrl`/`imageUrl` no Firestore) — nula quando não enviada. */
  coverUrl: string | null;
  stages: OrganizerLeagueStage[];
}
