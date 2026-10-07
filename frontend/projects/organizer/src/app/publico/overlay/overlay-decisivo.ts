import { effectiveScoringProfile, setPointsTarget } from '@nexago/sports';
import { matchLiveCurrentSet, matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { pointSituationOf } from './overlay-multi';
import type { OverlayDuelView } from './overlay-selectors';

/** Momento decisivo: alerta de set point, match point e tie-break sobre o placar.
 *
 *  A SITUAÇÃO sai da partida ao vivo (`decisivoSituacaoOf`, o mesmo cálculo do Multi-quadras); a
 *  MÁQUINA (`decisivoNext`) transforma a sequência de situações em "o que está no ar": o alerta
 *  entra com o set/match point, vira "Salvo" quando o adversário salva e some sozinho. Pura —
 *  quem tica o relógio e guarda o estado é a página. */

export type DecisivoKind = 'sp' | 'mp' | 'tb';
type Side = 'A' | 'B';

/** "Salvo" fica ~3 s e a faixa sai sozinha. */
export const DECISIVO_SALVO_MS = 3000;
/** O tie-break (início do set decisivo) avisa por este tempo e libera o placar. */
export const DECISIVO_TB_MS = 8000;

export interface DecisivoSituacao {
  kind: DecisivoKind;
  /** Quem tem a chance; `null` no tie-break (ninguém é destacado). */
  side: Side | null;
  setNumber: number;
  /** Tie-break: "Até N pontos". */
  limite: number | null;
}

/** Situação decisiva da partida AGORA, ou `null`. Set/match point têm prioridade sobre tie-break. */
export function decisivoSituacaoOf(match: TournamentMatch | null, v: OverlayDuelView | null): DecisivoSituacao | null {
  if (!match || !v || match.status !== 'in_progress') return null;
  const live = matchLiveCurrentSet(match);
  if (!live) return null;
  const [sa, sb] = matchSetWins(match);
  const sit = pointSituationOf(match, live, { a: sa, b: sb });
  if (sit.side) return { kind: sit.matchPoint ? 'mp' : 'sp', side: sit.side, setNumber: live.setNumber, limite: null };

  const profile = effectiveScoringProfile(match.scoringProfile, match.bestOf);
  if (profile.kind === 'sets_games') {
    if (!live.tiebreak) return null;
    const limite = live.superTiebreak ? profile.superTiebreakTo : profile.tiebreakTo;
    return { kind: 'tb', side: null, setNumber: live.setNumber, limite };
  }
  // Vôlei: o set decisivo (o último possível, só em melhor de 3 ou mais) é o "tie-break".
  if (profile.bestOf >= 3 && live.setNumber === profile.bestOf) {
    return { kind: 'tb', side: null, setNumber: live.setNumber, limite: setPointsTarget(profile, live.setNumber - 1) };
  }
  return null;
}

export type DecisivoPhase = 'idle' | 'ativo' | 'salvo';

export interface DecisivoState {
  matchId: string;
  phase: DecisivoPhase;
  kind: DecisivoKind | null;
  side: Side | null;
  setNumber: number;
  /** "2º match point": quantas vezes ESTA chance já apareceu (set/match point do mesmo lado). */
  n: number;
  limite: number | null;
  sinceMs: number;
  /** Sets vencidos quando a chance abriu: se o dono ganhar o set, o alerta acaba sem "Salvo". */
  setsAtStart: [number, number];
  /** Contagem por `partida:lado:tipo`. */
  counts: Readonly<Record<string, number>>;
  /** Tie-break já avisado (`partida:set`) — não volta quando o aviso termina. */
  tbVisto: string | null;
}

export const DECISIVO_INICIAL: DecisivoState = {
  matchId: '',
  phase: 'idle',
  kind: null,
  side: null,
  setNumber: 0,
  n: 0,
  limite: null,
  sinceMs: 0,
  setsAtStart: [0, 0],
  counts: {},
  tbVisto: null,
};

export interface DecisivoEntrada {
  matchId: string;
  sit: DecisivoSituacao | null;
  /** Sets vencidos agora (A, B). */
  sets: [number, number];
  /** A partida acabou (a última chance foi convertida). */
  encerrada: boolean;
  nowMs: number;
}

const keyOf = (matchId: string, side: Side, kind: DecisivoKind) => `${matchId}:${side}:${kind}`;

function abre(prev: DecisivoState, e: DecisivoEntrada, sit: DecisivoSituacao): DecisivoState {
  if (sit.kind === 'tb') {
    return { ...prev, matchId: e.matchId, phase: 'ativo', kind: 'tb', side: null, setNumber: sit.setNumber, n: 1, limite: sit.limite, sinceMs: e.nowMs, setsAtStart: e.sets, tbVisto: `${e.matchId}:${sit.setNumber}` };
  }
  const k = keyOf(e.matchId, sit.side!, sit.kind);
  const n = (prev.counts[k] ?? 0) + 1;
  return { ...prev, matchId: e.matchId, phase: 'ativo', kind: sit.kind, side: sit.side, setNumber: sit.setNumber, n, limite: null, sinceMs: e.nowMs, setsAtStart: e.sets, counts: { ...prev.counts, [k]: n } };
}

/** Próximo estado, dado o anterior e a situação de agora. Idempotente: sem mudança devolve o mesmo
 *  objeto (a página o chama a cada segundo). */
export function decisivoNext(prevIn: DecisivoState, e: DecisivoEntrada): DecisivoState {
  // Outra partida na quadra: recomeça do zero.
  const prev = prevIn.matchId !== e.matchId ? { ...DECISIVO_INICIAL, matchId: e.matchId } : prevIn;
  const sit = e.sit;
  const chance = sit && sit.kind !== 'tb' ? sit : null;

  if (prev.phase === 'salvo') {
    if (chance) return abre(prev, e, chance);
    return e.nowMs - prev.sinceMs >= DECISIVO_SALVO_MS ? { ...prev, phase: 'idle', kind: null, side: null } : prev;
  }

  if (prev.phase === 'ativo' && prev.kind !== 'tb') {
    if (chance && chance.side === prev.side && chance.kind === prev.kind && chance.setNumber === prev.setNumber) return prev;
    if (chance) return abre(prev, e, chance); // outro lado (ou virou match point): nova chance
    // A chance acabou. Dona converteu o set → fim do alerta; senão o adversário SALVOU.
    const i = prev.side === 'A' ? 0 : 1;
    if (e.encerrada || e.sets[i] > prev.setsAtStart[i]) return { ...prev, phase: 'idle', kind: null, side: null };
    return { ...prev, phase: 'salvo', sinceMs: e.nowMs };
  }

  if (prev.phase === 'ativo' && prev.kind === 'tb') {
    if (chance) return abre(prev, e, chance);
    if (!sit || e.nowMs - prev.sinceMs >= DECISIVO_TB_MS) return { ...prev, phase: 'idle', kind: null, side: null };
    return prev;
  }

  // idle
  if (chance) return abre(prev, e, chance);
  if (sit && sit.kind === 'tb' && prev.tbVisto !== `${e.matchId}:${sit.setNumber}`) return abre(prev, e, sit);
  return prev === prevIn ? prevIn : prev;
}

export interface DecisivoView {
  /** Tipo mostrado no título (no "Salvo" é o da chance que acabou de ser salva). */
  kind: DecisivoKind;
  salvo: boolean;
  side: Side | null;
  n: number;
  limite: number | null;
  /** "Quadra 2 | Masculino B | Set 3". */
  court: string | null;
  category: string | null;
  setNumber: number;
  bestOf: number;
  setsA: number;
  setsB: number;
  a: { teamId: string; label: string; score: number };
  b: { teamId: string; label: string; score: number };
}

export function decisivoViewOf(
  state: DecisivoState,
  match: TournamentMatch,
  v: OverlayDuelView,
  names: { court: string | null; category: string | null },
): DecisivoView | null {
  if (state.phase === 'idle' || state.kind == null) return null;
  return {
    kind: state.kind,
    salvo: state.phase === 'salvo',
    side: state.side,
    n: state.n,
    limite: state.limite,
    court: names.court,
    category: names.category,
    setNumber: state.setNumber,
    bestOf: match.bestOf,
    setsA: v.setsA,
    setsB: v.setsB,
    a: { teamId: v.a.teamId, label: v.a.label, score: v.pointsA ?? 0 },
    b: { teamId: v.b.teamId, label: v.b.label, score: v.pointsB ?? 0 },
  };
}
