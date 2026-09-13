import type { TournamentMatch } from '../../data/matches-repository';
import { tournamentListingStatus, type TournamentSummary } from '../../data/tournaments-repository';
import { endOfDay, startOfDay } from '../tournament-days';
import {
  eliminatedFromKnockout,
  isMyMatch,
  isPending,
  matchBelongsToDay,
  saoPauloDateKey,
} from '../tournament-live.selectors';

/** O torneio que deve abrir em Focus.
 *
 *  Só o torneio, sem partida: desde que o gatilho passou a ser o DIA DO EVENTO, pode não haver
 *  partida nenhuma ainda — no primeiro dia a chave costuma sair depois de o atleta chegar na
 *  arena, e era exatamente essa hora que a versão anterior (exigia partida agendada pra hoje)
 *  deixava de fora. */
export interface FocusDayTarget {
  tournamentId: string;
}

/** Campos da inscrição que decidem a entrada no Focus. Estruturalmente compatível com
 *  `AthleteTournamentRegistration` (`data/tournament-registrations-repository.ts`), então o
 *  serviço passa os docs sem adaptação. */
export interface FocusDayRegistration {
  tournamentId: string;
  categoryId: string;
  teamId: string | null;
  isPaid: boolean;
}

/** Campos do torneio que decidem se o evento roda hoje. */
export type FocusDayTournament = Pick<
  TournamentSummary,
  'startAt' | 'endAt' | 'rawStatus' | 'liveMatchesNow' | 'enrolledCount' | 'capacity' | 'isDraftOrCancelled'
>;

/**
 * O evento está acontecendo hoje — QUALQUER dia da janela, não só o de abertura.
 *
 * **Não use `eventDayOf` (`tournament-days.ts`) para isto.** Ela devolve `null` em torneio de um
 * dia só, de propósito ("dia 1 de 1" não é frase que se diga), e a base é quase toda de um dia:
 * o Focus não abriria para praticamente ninguém. A janela é verificada aqui, direto.
 *
 * Espelha `registrationShowsAsLiveToday` do app (`my_tournaments_logic.dart`): status ao vivo
 * responde na hora, terminal e cancelado barram, e o resto cai na janela do primeiro ao último
 * dia. O dia é o de São Paulo (`startOfDay`/`endOfDay`), nunca o do dispositivo — às 23h30 em
 * Manaus já é o dia seguinte na arena.
 */
export function tournamentRunsToday(t: FocusDayTournament, now: Date): boolean {
  if (t.isDraftOrCancelled) return false;
  const status = tournamentListingStatus(t, now);
  if (status === 'live') return true;
  if (status === 'ended') return false;
  const start = t.startAt;
  if (!start) return false;
  if (now < startOfDay(start)) return false;
  return now <= endOfDay(t.endAt ?? start);
}

/**
 * O torneio que abre em Focus, ou `null` quando hoje não é dia de torneio do atleta.
 *
 * Critérios, nesta ordem — os mesmos de `pickAthleteFocusHomeTarget` no app
 * (`athlete_tournament_day_logic.dart`), que as duas superfícies têm de manter de acordo:
 *  1. inscrição paga com `teamId` (reserva solo sem dupla fechada não tem time, e sem time não dá
 *     para dizer quais partidas são dele nem se caiu);
 *  2. torneio rolando hoje (`tournamentRunsToday`);
 *  3. ainda NÃO eliminado no mata-mata da categoria;
 *  4. entre os elegíveis, preferir quem tem partida hoje — se ninguém tem, fica o primeiro.
 *
 * Um torneio só: dois eventos no mesmo dia são raros, e não há para onde mandar o atleta duas
 * vezes. A ordem é estável por id para ele não ser jogado num torneio diferente a cada
 * navegação.
 */
export function focusDayTargetOf(
  registrations: readonly FocusDayRegistration[],
  tournamentsById: ReadonlyMap<string, FocusDayTournament>,
  matchesByTournament: ReadonlyMap<string, readonly TournamentMatch[]>,
  now: Date,
): FocusDayTarget | null {
  let withMatchToday: FocusDayTarget | null = null;
  let anyAlive: FocusDayTarget | null = null;

  for (const reg of [...registrations].sort((a, b) => a.tournamentId.localeCompare(b.tournamentId))) {
    const teamId = reg.teamId?.trim() ?? '';
    if (!reg.isPaid || teamId.length === 0) continue;

    const tournament = tournamentsById.get(reg.tournamentId);
    if (!tournament || !tournamentRunsToday(tournament, now)) continue;

    const matches = matchesByTournament.get(reg.tournamentId) ?? [];
    const myTeamIds = new Set([teamId]);
    if (reg.categoryId.length > 0 && eliminatedFromKnockout(matches, reg.categoryId, myTeamIds)) continue;

    const target: FocusDayTarget = { tournamentId: reg.tournamentId };
    anyAlive ??= target;
    if (withMatchToday) continue;

    // `matchBelongsToDay` com `tournamentRunningToday = true`: aqui já se sabe que o evento é
    // hoje, então partida SEM horário conta — é o caso da fila do dia e da chave recém-gerada.
    // Delega nele em vez de comparar `scheduleTime` na mão para não criar uma segunda definição
    // de "partida de hoje", que discordaria da timeline "Seu dia no torneio".
    const hasMatchToday = matches.some(
      (m) => isMyMatch(m, myTeamIds) && isPending(m) && matchBelongsToDay(m, now, true),
    );
    if (hasMatchToday) withMatchToday = target;
  }

  return withMatchToday ?? anyAlive;
}

/** Chave da memoização: o alvo do dia só vale para o MESMO atleta no MESMO dia. Sem ela, uma
 *  aba aberta depois da meia-noite — ou uma troca de conta sem recarregar — serve o alvo de
 *  ontem, ou o de outra pessoa. */
export function focusMemoKeyOf(uid: string, reference: Date): string {
  return `${uid}:${saoPauloDateKey(reference)}`;
}
