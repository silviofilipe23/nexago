import { truncateName } from '../data/mock-data';
import type { TournamentMatch } from '../data/matches-repository';

/** Lógica pura do telão — o que aparece em cada quadra, a fila de próximos jogos, a chamada
 *  de atletas e a paginação da rotação automática. Tudo determinístico em cima de
 *  (`matches`, `courtIds`, `nowMs`) pra ser testável sem Firestore/relógio. */

/** Quadras por página da grade (2×2). Acima disso a rotação automática pagina. */
export const COURTS_PER_PAGE = 4;
export const ROTATE_INTERVAL_MS = 20_000;
/** Chamada: apresentar-se até 5 min antes do horário do jogo. */
export const CALL_ANTECEDENCE_MS = 5 * 60_000;
/** Fila: jogo recém-passado ainda aparece por 10 min (atraso normal de quadra). */
export const QUEUE_GRACE_MS = 10 * 60_000;
/** Card da quadra: agendada há até 30 min ainda é "em seguida"; mais que isso, o jogo
 *  esquecido não segura a quadra. */
export const COURT_NOW_GRACE_MS = 30 * 60_000;

export type CourtNowKind = 'live' | 'next' | 'free';

export interface CourtNow {
  kind: CourtNowKind;
  match: TournamentMatch | null;
}

/** Partida em destaque da quadra: ao vivo (desempate: começou por último — é a que está na
 *  areia) → senão a próxima agendada dentro da tolerância → senão livre. */
export function courtNowOf(matches: readonly TournamentMatch[], courtId: string, nowMs: number): CourtNow {
  const onCourt = matches.filter((m) => m.courtId === courtId);
  const live = onCourt
    .filter((m) => m.status === 'in_progress')
    .sort((a, b) => (b.matchStartedAt?.getTime() ?? 0) - (a.matchStartedAt?.getTime() ?? 0))[0];
  if (live) return { kind: 'live', match: live };
  const next = onCourt
    .filter((m) => m.status === 'scheduled' && m.scheduledAt != null)
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
    .find((m) => m.scheduledAt!.getTime() >= nowMs - COURT_NOW_GRACE_MS);
  if (next) return { kind: 'next', match: next };
  return { kind: 'free', match: null };
}

/** Fila "Próximos jogos": agendadas futuras (com tolerância) nas quadras selecionadas,
 *  ordenadas por horário e nº do jogo. */
export function upcomingQueue(matches: readonly TournamentMatch[], courtIds: readonly string[], nowMs: number, limit = 6): TournamentMatch[] {
  const courts = new Set(courtIds);
  return matches
    .filter((m) => m.status === 'scheduled' && m.scheduledAt != null && courts.has(m.courtId) && m.scheduledAt.getTime() >= nowMs - QUEUE_GRACE_MS)
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime() || a.matchNumber - b.matchNumber)
    .slice(0, limit);
}

export interface TelaoCall {
  match: TournamentMatch;
  deadline: Date;
}

/** Chamada de atletas: o 1º da fila, com prazo de apresentação 5 min antes do horário. */
export function callOf(queue: readonly TournamentMatch[]): TelaoCall | null {
  const first = queue[0];
  if (!first?.scheduledAt) return null;
  return { match: first, deadline: new Date(first.scheduledAt.getTime() - CALL_ANTECEDENCE_MS) };
}

export function courtPageCount(courtCount: number, pageSize = COURTS_PER_PAGE): number {
  return courtCount <= pageSize ? 1 : Math.ceil(courtCount / pageSize);
}

/** Página visível da rotação (wrap-around em qualquer índice). */
export function courtPageOf(courtIds: readonly string[], pageIndex: number, pageSize = COURTS_PER_PAGE): string[] {
  if (courtIds.length <= pageSize) return [...courtIds];
  const pages = courtPageCount(courtIds.length, pageSize);
  const page = ((pageIndex % pages) + pages) % pages;
  return courtIds.slice(page * pageSize, page * pageSize + pageSize);
}

/** "Lucas Martins / Paula da Silva" → "Lucas / Paula" — primeiro nome de cada jogador; nome
 *  custom de equipe (sem " / ") passa truncado pro card não estourar. */
export function teamShortLabel(label: string): string {
  const parts = label.split(' / ');
  if (parts.length < 2) return truncateName(label, 22);
  return parts.map((p) => p.trim().split(/\s+/)[0] ?? '').join(' / ');
}
