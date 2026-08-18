import type { TournamentMatch } from '../painel/data/matches-repository';
import { formatCourtLabel, spDayLabel, spTimeLabel } from '../painel/data/schedule-format';
import type { OrganizerTournamentCategory, OrganizerTournamentCourt } from '../painel/data/tournament.model';
import { courtNowOf, upcomingQueue, type CourtNowKind } from '../painel/telao/telao-selectors';

/** Lógica pura da página pública `/t/:tournamentId`. Reusa os seletores do telão — a página é
 *  o mesmo recorte ("o que está em cada quadra agora"), só que no celular de quem assiste e
 *  com TODAS as quadras do torneio: `bigScreen.courtIds` é escolha da TV da arena, não do
 *  público. Determinística em (`matches`, `courts`, `nowMs`). */

export interface PublicCourtRow {
  id: string;
  /** Nome já normalizado ("1" → "Quadra 1"). */
  name: string;
  kind: CourtNowKind;
  match: TournamentMatch | null;
  categoryLabel: string;
}

export function categoryNameOf(categories: readonly OrganizerTournamentCategory[], categoryId: string | null): string {
  if (!categoryId) return '';
  return categories.find((c) => c.id === categoryId)?.name ?? '';
}

export function publicCourtRows(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  categories: readonly OrganizerTournamentCategory[],
  nowMs: number,
): PublicCourtRow[] {
  return courts.map((court) => {
    const { kind, match } = courtNowOf(matches, court.id, nowMs);
    return {
      id: court.id,
      name: formatCourtLabel(court.name),
      kind,
      match,
      categoryLabel: match ? categoryNameOf(categories, match.categoryId) : '',
    };
  });
}

export interface PublicUpcomingRow {
  id: string;
  time: string;
  day: string;
  court: string;
  teams: string;
  meta: string;
}

/** Fila de próximos jogos do torneio inteiro. Partida agendada SEM quadra fica de fora — é a
 *  mesma regra do telão (`upcomingQueue` filtra por quadra), e sem quadra não há para onde
 *  mandar o atleta. */
export function publicUpcomingRows(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  categories: readonly OrganizerTournamentCategory[],
  nowMs: number,
  limit = 8,
): PublicUpcomingRow[] {
  return upcomingQueue(matches, courts.map((c) => c.id), nowMs, limit).map((m) => ({
    id: m.id,
    time: m.scheduledAt ? spTimeLabel(m.scheduledAt) : '',
    day: m.scheduledAt ? spDayLabel(m.scheduledAt) : '',
    court: formatCourtLabel(m.court),
    teams: `${m.team1Label} vs ${m.team2Label}`,
    meta: [categoryNameOf(categories, m.categoryId), m.round ?? ''].filter((part) => part.length > 0).join(' · '),
  }));
}

/** Instante do resultado: fim real quando a mesa gravou; senão o horário agendado (o
 *  lançamento rápido pode encerrar sem `matchEndedAt`); senão nada. */
function resultTimeOf(m: TournamentMatch): number {
  return m.matchEndedAt?.getTime() ?? m.scheduledAt?.getTime() ?? 0;
}

/** Últimos jogos encerrados, mais recente primeiro; empate cai no número do jogo. */
export function recentResults(matches: readonly TournamentMatch[], limit = 12): TournamentMatch[] {
  return [...matches]
    .filter((m) => m.status === 'completed')
    .sort((a, b) => resultTimeOf(b) - resultTimeOf(a) || b.matchNumber - a.matchNumber)
    .slice(0, limit);
}
