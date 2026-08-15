import { httpsCallable } from 'firebase/functions';
import { athleteFunctions } from './functions';

/** Write-paths de placar que o mesário usa — os MESMOS callables do portal do organizador
 *  (`organizer-ops.service.ts`) e do app (`organizer_match_ops_service.dart`). Todos passam
 *  por `assertCanScoreTournament` no servidor (`functions/src/tournament-acl.ts`), que aceita
 *  dono, gestor e mesário: nenhuma permissão nova foi criada pra esta tela. */

function call<T = Record<string, unknown>>(name: string, payload: Record<string, unknown>): Promise<T> {
  const callable = httpsCallable(athleteFunctions(), name);
  return callable(payload).then((r) => (r.data ?? {}) as T);
}

export interface MatchSetInput {
  a: number;
  b: number;
}

/** Placar por sets (resultado final) — validação autoritativa no servidor; o avanço da chave
 *  dispara sozinho no trigger `onTournamentMatchCompletedAdvance`. */
export function submitMatchResult(params: { matchId: string; sets: MatchSetInput[]; bestOf?: number }): Promise<{ ok?: boolean; completed?: boolean; winnerId?: string }> {
  return call('submitMatchResult', {
    matchId: params.matchId.trim(),
    sets: params.sets,
    ...(params.bestOf != null ? { bestOf: params.bestOf } : {}),
  });
}

export function validateMatchResult(matchId: string): Promise<unknown> {
  return call('validateMatchResult', { matchId: matchId.trim() });
}

/** Placar agregado de transmissão (`liveScore`) — só a CF grava (fora das allowlists das
 *  rules). Com tudo zerado é o START explícito da mesa: o servidor seta `In Progress` +
 *  `matchStartedAt` e recalcula `tournaments.liveMatchesNow`, então a partida aparece "ao vivo"
 *  pros atletas antes do primeiro ponto. */
export function updateLiveMatchScore(params: { matchId: string; setsA: number; setsB: number; currentGamesA: number; currentGamesB: number }): Promise<{ ok?: boolean }> {
  return call('updateLiveMatchScore', {
    matchId: params.matchId.trim(),
    setsA: params.setsA,
    setsB: params.setsB,
    currentGamesA: params.currentGamesA,
    currentGamesB: params.currentGamesB,
  });
}
