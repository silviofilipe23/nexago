import type { DiscoveryLeague, DiscoveryLeagueStage } from './tournament-discovery.models';

/** Todos os ids de torneio que aparecem em alguma liga (evita duplicar no grid “avulsos”). */
export function collectLeagueTournamentIds(leagues: DiscoveryLeague[]): Set<string> {
  const s = new Set<string>();
  for (const league of leagues) {
    for (const stage of league.stages) {
      for (const id of stage.tournamentIds) {
        s.add(id);
      }
    }
  }
  return s;
}

export interface ResolvedLeagueContext {
  league: DiscoveryLeague;
  stage: DiscoveryLeagueStage;
}

export function resolveLeagueContext(
  leagues: DiscoveryLeague[],
  tournamentId: string,
): ResolvedLeagueContext | null {
  for (const league of leagues) {
    const stages = [...league.stages].sort((a, b) => a.order - b.order);
    for (const stage of stages) {
      if (stage.tournamentIds.includes(tournamentId)) {
        return { league, stage };
      }
    }
  }
  return null;
}

/** Rótulo único para breadcrumb / inscrição. */
export function leagueContextLabel(ctx: ResolvedLeagueContext): string {
  return `${ctx.league.name} · ${ctx.stage.name}`;
}
