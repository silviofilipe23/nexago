import { isKingOfCourtMatchType } from '../../painel/data/koc';
import { matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournamentCourt } from '../../painel/data/tournament.model';
import { courtNumberOf } from './overlay-multi';

/** Dados da tela de Intervalo lidos das partidas do torneio: o "A seguir", os 3 jogos seguintes
 *  e os resultados recentes do letreiro. Puro — a tela só desenha. */

export const INTERVALO_FOLLOWING = 3;
export const INTERVALO_RESULTS_MAX = 12;
/** Jogo agendado há pouco ainda conta como "a seguir" (a quadra atrasa). */
const NEXT_GRACE_MS = 30 * 60_000;

export interface IntervaloGame {
  matchId: string;
  /** "15:40". */
  time: string | null;
  a: { teamId: string; label: string };
  b: { teamId: string; label: string };
  /** "Masculino B". */
  category: string;
  /** "Semifinal". */
  phase: string;
  /** Número da quadra; `null` se a quadra não está no cadastro. */
  court: number | null;
}

export interface IntervaloResult {
  matchId: string;
  /** "Fem. A · QF". */
  tag: string;
  winner: { teamId: string; label: string };
  loser: { teamId: string; label: string };
  /** "2–1" — sets do vencedor × do perdedor. */
  score: string;
}

export interface IntervaloView {
  next: IntervaloGame | null;
  following: IntervaloGame[];
  results: IntervaloResult[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Masculino B" → "Masc. B"; "Feminino A" → "Fem. A"; o resto fica como está. */
export function categoryShortOf(name: string): string {
  return name
    .trim()
    .replace(/^masculin[oa]\b/i, 'Masc.')
    .replace(/^feminin[oa]\b/i, 'Fem.');
}

/** "Quartas de final" → "QF", "Semifinal" → "SF", "Oitavas" → "OF", "Final" → "F". */
export function phaseShortOf(phase: string): string {
  const p = phase.trim().toLowerCase();
  if (/^quartas?/.test(p)) return 'QF';
  if (/^semi/.test(p)) return 'SF';
  if (/^oitavas?/.test(p)) return 'OF';
  if (/^final$/.test(p)) return 'F';
  if (/^3[ºo°]|terceiro/.test(p)) return '3º';
  return phase.trim();
}

export function intervaloViewOf(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  categoryNameOf: (categoryId: string | null) => string | null,
  nowMs: number,
): IntervaloView {
  const ordered = [...courts].sort((x, y) => x.order - y.order);
  const real = matches.filter((m) => m.status !== 'canceled' && !isKingOfCourtMatchType(m.matchType));

  const gameOf = (m: TournamentMatch): IntervaloGame => {
    const ci = ordered.findIndex((c) => c.id === m.courtId);
    const d = m.scheduledAt;
    return {
      matchId: m.id,
      time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null,
      a: { teamId: m.teamAId, label: m.team1Label },
      b: { teamId: m.teamBId, label: m.team2Label },
      category: categoryNameOf(m.categoryId) ?? '',
      phase: m.round?.trim() ?? '',
      court: ci >= 0 ? courtNumberOf(ordered[ci]!, ci) : null,
    };
  };

  const upcoming = real
    .filter((m) => m.status === 'scheduled' && m.scheduledAt != null && m.scheduledAt.getTime() >= nowMs - NEXT_GRACE_MS)
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime() || a.matchNumber - b.matchNumber);

  const results = real
    .filter((m) => m.status === 'completed' && m.winnerSide != null)
    .sort((a, b) => (b.matchEndedAt?.getTime() ?? 0) - (a.matchEndedAt?.getTime() ?? 0))
    .slice(0, INTERVALO_RESULTS_MAX)
    .map((m): IntervaloResult => {
      const [sa, sb] = matchSetWins(m);
      const aWon = m.winnerSide === 1;
      const cat = categoryShortOf(categoryNameOf(m.categoryId) ?? '');
      const phase = phaseShortOf(m.round ?? '');
      return {
        matchId: m.id,
        tag: [cat, phase].filter((p) => p !== '').join(' · '),
        winner: aWon ? { teamId: m.teamAId, label: m.team1Label } : { teamId: m.teamBId, label: m.team2Label },
        loser: aWon ? { teamId: m.teamBId, label: m.team2Label } : { teamId: m.teamAId, label: m.team1Label },
        score: aWon ? `${sa}–${sb}` : `${sb}–${sa}`,
      };
    });

  return {
    next: upcoming[0] ? gameOf(upcoming[0]) : null,
    following: upcoming.slice(1, 1 + INTERVALO_FOLLOWING).map(gameOf),
    results,
  };
}

/** Segundos restantes da contagem (arredonda pra cima: 5:00 abre em "5:00", não "4:59");
 *  `null` = sem contagem rodando (duração 0 ou não iniciada). */
export function intervaloRestanteSeg(startedAt: Date | null, durationSec: number, nowMs: number): number | null {
  if (durationSec <= 0 || !startedAt) return null;
  return Math.max(0, Math.ceil((durationSec * 1000 - (nowMs - startedAt.getTime())) / 1000));
}
