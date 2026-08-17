import { isSetWon, targetPointsForSet, type LivePointEvent } from '@nexago/live-scoring';
import { matchBestOf, matchIsLive, type TournamentMatch } from '../../data/matches-repository';
import { timeLabelOf } from '../tournament-format';

/**
 * Timeline ponto a ponto de uma partida, derivada da subcoleção `pointEvents` que as três mesas
 * gravam (ver `recordPointTransaction`). Funções puras: o componente só passa o doc da partida,
 * os eventos e de que lado o atleta está.
 *
 * Regra de ouro: NUNCA inventar ponto. Partida lançada pelo placar agregado não tem evento, e
 * mesa que entrou no meio do set tem só parte deles — nesses casos a timeline mostra o que existe
 * e declara quantos pontos ficaram sem registro, em vez de interpolar pontos que ninguém marcou.
 * (O app faz o contrário em `_completeTimelineFromSetScores`, preenchendo com pontos estimados;
 * aqui a divergência é deliberada.)
 */

export type PointAnnotation = 'empate' | 'virada';

/** Coluna esquerda: a dupla do atleta quando ele joga a partida, senão o lado A do doc. */
export interface PointRow {
  fromLeft: boolean;
  /** Placar ACUMULADO do set depois deste ponto, já na perspectiva das colunas. */
  left: number;
  right: number;
  time: string;
  annotation: PointAnnotation | null;
  closesSet: boolean;
}

export interface SetSummary {
  longestStreak: number;
  ties: number;
  comebacks: number;
  /** "18 min" — só quando os eventos gravados têm hora. */
  durationLabel: string | null;
}

export interface StreakBlock {
  fromLeft: boolean;
  label: string;
  time: string;
  points: PointRow[];
  longest: boolean;
}

export interface PointScore {
  left: number;
  right: number;
}

export interface PointByPointSet {
  /** 0-based, como o doc grava em `sets[]`/`setIndex`. */
  setIndex: number;
  /** 1-based, como o atleta lê ("Set 2"). */
  setNumber: number;
  /** Placar do set (final ou parcial) na perspectiva das colunas. */
  score: PointScore;
  blocks: StreakBlock[];
  /** Pontos que o placar do set tem e a mesa não gravou. 0 = timeline completa. */
  missingCount: number;
  /** Trecho do set que a mesa marcou — só quando falta ponto E existe algo gravado. */
  recordedRange: { from: PointScore; to: PointScore } | null;
  summary: SetSummary;
}

/** A hora crua fica fora do tipo público: só o resumo precisa dela (a UI usa `time` já formatado). */
type TimedPoint = PointRow & { ts: Date | null };

/** Reconstrói os pontos de cada set a partir dos eventos: `point` empilha, `undo-point` desfaz o
 *  último do MESMO set (o mesmo casamento que `lastUndoablePoint` faz para a mesa).
 *
 *  Ponto que não mexeu no placar acumulado é escrita repetida da mesa, não lance novo — visto em
 *  dados reais (dev, seqs 102/103 em 8×1 e 138/139 em 12×10) — e desenhar o mesmo placar duas vezes
 *  lê como bug da tela. A comparação é contra o último ponto QUE SOBROU, então um placar que um
 *  `undo-point` desfez pode voltar normalmente. */
function replayBySet(events: readonly LivePointEvent[], leftIsA: boolean): Map<number, TimedPoint[]> {
  const bySet = new Map<number, TimedPoint[]>();
  const ordered = [...events].sort((x, y) => x.seq - y.seq);

  for (const e of ordered) {
    const points = bySet.get(e.setIndex) ?? [];
    if (e.type === 'point' && e.side != null) {
      const left = leftIsA ? e.scoreA : e.scoreB;
      const right = leftIsA ? e.scoreB : e.scoreA;
      const previous = points[points.length - 1];
      if (!previous || previous.left !== left || previous.right !== right) {
        points.push({
          fromLeft: leftIsA ? e.side === 'A' : e.side === 'B',
          left,
          right,
          time: timeLabelOf(e.ts),
          annotation: null,
          closesSet: false,
          ts: e.ts,
        });
      }
    } else if (e.type === 'undo-point') {
      points.pop();
    }
    bySet.set(e.setIndex, points);
  }

  return bySet;
}

/** Empate quando o ponto iguala o placar; virada quando a liderança TROCA de lado. O primeiro
 *  ponto do set não é virada: ninguém liderava antes dele. A liderança anterior atravessa os
 *  empates — é ela que define de quem a virada tirou a frente. */
function annotate(points: TimedPoint[]): void {
  let lastLeader: 'left' | 'right' | null = null;
  for (const p of points) {
    if (p.left === p.right) {
      p.annotation = 'empate';
      continue;
    }
    const leader = p.left > p.right ? 'left' : 'right';
    if (lastLeader != null && lastLeader !== leader) p.annotation = 'virada';
    lastLeader = leader;
  }
}

/** O ponto que fechou o set é o que levou o placar ao alvo com vantagem — a mesma regra do motor
 *  compartilhado, então o set em andamento (10×8) não ganha o selo. */
function markSetClosing(points: TimedPoint[], setIndex: number, bestOf: number): void {
  const target = targetPointsForSet(setIndex, bestOf);
  for (const p of points) {
    p.closesSet = isSetWon(p.left, p.right, target);
  }
}

function blocksOf(points: readonly TimedPoint[]): StreakBlock[] {
  const raw: StreakBlock[] = [];
  for (const p of points) {
    const open = raw[raw.length - 1];
    if (open && open.fromLeft === p.fromLeft) open.points.push(p);
    else raw.push({ fromLeft: p.fromLeft, label: '', time: p.time, points: [p], longest: false });
  }

  const max = raw.reduce((acc, b) => Math.max(acc, b.points.length), 0);
  return raw.map((b) => ({
    ...b,
    label: b.points.length === 1 ? 'PONTO' : `${b.points.length} SEGUIDOS`,
    longest: b.points.length === max && max >= 2,
  }));
}

/** "18 min" do primeiro ao último ponto GRAVADO. Sem hora nos eventos (mesa antiga) não afirma
 *  nada: melhor não mostrar duração do que mostrar uma errada. */
function durationLabelOf(points: readonly TimedPoint[]): string | null {
  const first = points[0]?.ts ?? null;
  const last = points[points.length - 1]?.ts ?? null;
  if (points.length < 2 || !first || !last) return null;
  const minutes = Math.round((last.getTime() - first.getTime()) / 60_000);
  return minutes < 1 ? 'menos de 1 min' : `${minutes} min`;
}

function summaryOf(points: readonly TimedPoint[], blocks: readonly StreakBlock[]): SetSummary {
  return {
    longestStreak: blocks.reduce((acc, b) => Math.max(acc, b.points.length), 0),
    ties: points.filter((p) => p.annotation === 'empate').length,
    comebacks: points.filter((p) => p.annotation === 'virada').length,
    durationLabel: durationLabelOf(points),
  };
}

/** Placar do set: o doc manda (`sets[]` é o que a tela de parciais mostra e o que a mesa mantém
 *  atualizado, set corrente incluído). Sem entrada no doc, cai no último ponto gravado. */
function scoreOf(match: TournamentMatch, setIndex: number, points: readonly TimedPoint[], leftIsA: boolean): PointScore {
  const s = match.sets[setIndex];
  if (s) return { left: leftIsA ? s.a : s.b, right: leftIsA ? s.b : s.a };
  const last = points[points.length - 1];
  return last ? { left: last.left, right: last.right } : { left: 0, right: 0 };
}

/** Pontos do set que ficaram sem registro: o placar diz quantos pontos foram disputados, e cada
 *  linha da timeline é um placar distinto que a mesa marcou — a diferença é o que faltou.
 *
 *  Contar linhas, e não as pontas do trecho gravado, é o que enxerga a lacuna do MEIO do set: em
 *  dados reais o undo já apagou pontos entre dois trechos marcados (12×2 e 12×3 no set 3 de
 *  `SGrrDydwtkMxZ9P9zTiC`), e olhar só o primeiro e o último ponto daria zero. A escrita repetida
 *  que o replay recusa não vira pendência falsa porque o placar dela continua na linha anterior. */
function missingCountOf(points: readonly TimedPoint[], score: PointScore): number {
  return Math.max(0, score.left + score.right - points.length);
}

/** Sets que valem uma linha na tela: os que têm evento gravado MAIS os que têm ponto no placar
 *  (set jogado antes da mesa ponto a ponto ainda existe, mesmo sem timeline). */
function setIndexesOf(match: TournamentMatch, bySet: ReadonlyMap<number, TimedPoint[]>): number[] {
  const fromScore = match.sets.map((s, i) => (s.a + s.b > 0 ? i : -1)).filter((i) => i >= 0);
  return [...new Set([...bySet.keys(), ...fromScore])].sort((x, y) => x - y);
}

/** "maior sequência 4 · 6 empates · 2 viradas · 18 min" — só o que de fato aconteceu. Sequência
 *  de 1 não é sequência, então fica de fora. */
export function summaryLineOf(summary: SetSummary): string | null {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    summary.longestStreak >= 2 ? `maior sequência ${summary.longestStreak}` : null,
    summary.ties > 0 ? plural(summary.ties, 'empate', 'empates') : null,
    summary.comebacks > 0 ? plural(summary.comebacks, 'virada', 'viradas') : null,
    summary.durationLabel,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Que set abrir quando a tela carrega: o que está sendo jogado, se a partida rola; senão o
 *  último que tem timeline (não faz sentido abrir num set que ninguém marcou); e, se nenhum tem,
 *  o último set do placar. */
export function defaultSetIndexOf(sets: readonly PointByPointSet[], match: TournamentMatch): number | null {
  if (sets.length === 0) return null;
  if (matchIsLive(match)) {
    const current = sets.find((s) => s.setIndex === match.currentSetIndex);
    if (current) return current.setIndex;
  }
  const withTimeline = sets.filter((s) => s.blocks.length > 0);
  return (withTimeline[withTimeline.length - 1] ?? sets[sets.length - 1]!).setIndex;
}

export function pointByPointSetsOf(params: {
  match: TournamentMatch;
  events: readonly LivePointEvent[];
  mySide: 'A' | 'B' | null;
}): PointByPointSet[] {
  const leftIsA = params.mySide !== 'B';
  const bestOf = matchBestOf(params.match);
  const bySet = replayBySet(params.events, leftIsA);

  return setIndexesOf(params.match, bySet).map((setIndex) => {
    const points = bySet.get(setIndex) ?? [];
    annotate(points);
    markSetClosing(points, setIndex, bestOf);
    const blocks = blocksOf(points);
    const score = scoreOf(params.match, setIndex, points, leftIsA);
    const missingCount = missingCountOf(points, score);
    const first = points[0];
    const last = points[points.length - 1];
    return {
      setIndex,
      setNumber: setIndex + 1,
      score,
      blocks,
      missingCount,
      recordedRange:
        missingCount > 0 && first && last
          ? { from: { left: first.left, right: first.right }, to: { left: last.left, right: last.right } }
          : null,
      summary: summaryOf(points, blocks),
    };
  });
}
