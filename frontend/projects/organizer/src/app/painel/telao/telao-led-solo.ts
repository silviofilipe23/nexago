import {
  formatMedicalTimeoutMmSs,
  medicalTimeoutRemainingSeconds,
  technicalTimeoutRemainingSeconds,
} from '@nexago/live-scoring';
import { courtSwitchInterval, effectiveScoringProfile, setPointsTarget } from '@nexago/sports';
import { matchLiveCurrentSet, matchClosedSets } from '../data/live-set-display';
import type { TournamentMatch } from '../data/matches-repository';
import { tecnicoNoAr } from '../../publico/overlay/overlay-tecnico';

/** Placar de UMA quadra em tela cheia — o telão com uma quadra só e o painel de LED da quadra.
 *
 *  O painel fica na beira da areia, de frente pra quadra: quem está à esquerda do painel tem que
 *  aparecer à esquerda. Por isso os lados trocam sozinhos, pela MESMA regra que manda as duplas
 *  trocarem (`courtSwitchInterval`: a cada 7 pontos, 5 no decisivo de 15) e na virada de set —
 *  a mesma que a mesa do app sugere ao abrir o set seguinte. Sai do placar, sem escrita nenhuma:
 *  desfazer o ponto desfaz a troca. */

export type LedSide = 'A' | 'B';

type LedMatch = Pick<
  TournamentMatch,
  'status' | 'sets' | 'liveScore' | 'currentSetIndex' | 'bestOf' | 'scoringProfile' | 'currentGame'
>;

/** Set (0-based) e pontos somados que decidem o lado. Encerrada, conta até o penúltimo ponto:
 *  o ponto que fecha a partida não manda ninguém trocar de quadra. */
function swapBasisOf(m: LedMatch): { setIndex: number; total: number; closing: boolean } | null {
  if (m.status === 'in_progress') {
    const live = matchLiveCurrentSet(m);
    if (live) return { setIndex: live.setNumber - 1, total: live.a + live.b, closing: false };
    // Entre sets (o corrente ainda sem ponto): já é o set seguinte.
    return { setIndex: matchClosedSets(m).length, total: 0, closing: false };
  }
  if (m.status === 'completed' && m.sets.length > 0) {
    const last = m.sets[m.sets.length - 1];
    return { setIndex: m.sets.length - 1, total: last.a + last.b, closing: true };
  }
  return null;
}

/** Quantas trocas de lado a partida já teve: uma por virada de set + as do set corrente. */
export function ledSwapCountOf(m: LedMatch): number {
  const basis = swapBasisOf(m);
  if (!basis) return 0;
  const interval = courtSwitchInterval(effectiveScoringProfile(m.scoringProfile, m.bestOf), basis.setIndex);
  const played = basis.closing ? Math.max(basis.total - 1, 0) : basis.total;
  return basis.setIndex + (interval ? Math.floor(played / interval) : 0);
}

/** Lado da partida que aparece à ESQUERDA do painel. Começa com A. */
export function ledLeftSideOf(m: LedMatch): LedSide {
  return ledSwapCountOf(m) % 2 === 0 ? 'A' : 'B';
}

/** Selo do centro, embaixo dos sets. */
export interface LedChip {
  kind: 'troca' | 'alvo' | 'games' | 'fim';
  label: string;
  value: string;
}

/** Ao vivo: TROCA DE LADO no ponto da troca (sai no ponto seguinte), senão o alvo do set
 *  ("SET ATÉ 21") ou os games do set em partida de games. Encerrada: FIM DE JOGO. */
export function ledChipOf(m: LedMatch, left: LedSide): LedChip | null {
  if (m.status === 'completed') return { kind: 'fim', label: 'Fim de jogo', value: '' };
  if (m.status !== 'in_progress') return null;
  const profile = effectiveScoringProfile(m.scoringProfile, m.bestOf);
  const live = matchLiveCurrentSet(m);
  const setIndex = live ? live.setNumber - 1 : matchClosedSets(m).length;
  const total = live ? live.a + live.b : 0;
  const interval = courtSwitchInterval(profile, setIndex);
  if (interval && total > 0 && total % interval === 0) return { kind: 'troca', label: 'Troca de lado', value: '' };
  if (live?.game) {
    const [l, r] = left === 'A' ? [live.a, live.b] : [live.b, live.a];
    return { kind: 'games', label: 'Games', value: `${l}-${r}` };
  }
  if (profile.kind === 'sets_points') return { kind: 'alvo', label: 'Set até', value: String(setPointsTarget(profile, setIndex)) };
  return null;
}

/** Partida PARADA: o painel inteiro vira o aviso, com a contagem. */
export interface LedPausa {
  kind: 'tempo' | 'medico';
  /** Muda a cada pausa nova — re-anima a entrada. */
  key: string;
  title: string;
  who: string;
  clock: string;
}

/** Atendimento médico (fica no ar até a mesa encerrar, mesmo em 00:00 — quem decide a volta é a
 *  mesa) ou pedido de tempo da dupla, válido enquanto o placar do set for o da chamada e até
 *  poucos segundos depois de zerar — mesma regra do overlay do OBS. */
export function ledPausaOf(
  m: TournamentMatch,
  nowMs: number,
  teamNames: Record<LedSide, string>,
  playerNames: Record<LedSide, readonly string[]>,
): LedPausa | null {
  if (m.status !== 'in_progress') return null;
  const now = new Date(nowMs);

  const med = m.medicalTimeout;
  if (med) {
    const who = med.playerName.trim() || playerNames[med.side][med.playerSlot - 1]?.trim() || teamNames[med.side];
    return {
      kind: 'medico',
      key: `med:${med.side}:${med.playerSlot}:${med.startedAt?.getTime() ?? 0}`,
      title: 'Tempo médico',
      who,
      clock: formatMedicalTimeoutMmSs(medicalTimeoutRemainingSeconds(med, now)),
    };
  }

  const tt = m.technicalTimeout;
  if (!tt) return null;
  const live = matchLiveCurrentSet(m);
  if (!live || live.setNumber - 1 !== tt.setIndex || live.a !== tt.scoreA || live.b !== tt.scoreB) return null;
  const startMs = tt.startedAt?.getTime() ?? nowMs;
  if (!tecnicoNoAr(startMs, tt.durationSec * 1000, nowMs)) return null;
  return {
    kind: 'tempo',
    key: `tt:${tt.setIndex}:${startMs}`,
    title: 'Pedido de tempo',
    who: teamNames[tt.side],
    clock: formatMedicalTimeoutMmSs(technicalTimeoutRemainingSeconds(tt, now)),
  };
}

/** "Quadra 1" → rótulo e número separados (o número sai em laranja). Sem número no fim, tudo
 *  é rótulo. */
export function ledCourtParts(courtName: string): { label: string; number: string } {
  const match = /^(.*?)\s*(\d+)$/.exec(courtName.trim());
  return match ? { label: match[1], number: match[2] } : { label: courtName.trim(), number: '' };
}

/** Linhas do nome no card: um atleta por linha ("Emerson / Enzo"). Equipe de nome próprio
 *  ("Os Imbatíveis da Praia") quebra em duas linhas equilibradas — numa linha só ela encolheria
 *  até ficar ilegível do fundo da arena. */
export function ledNameLines(short: string): string[] {
  const parts = short.split(' / ').map((n) => n.trim()).filter(Boolean);
  if (parts.length !== 1) return parts;
  const words = parts[0].split(/\s+/);
  if (words.length < 2) return parts;
  let best = 1;
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const len = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length);
    if (len < bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
