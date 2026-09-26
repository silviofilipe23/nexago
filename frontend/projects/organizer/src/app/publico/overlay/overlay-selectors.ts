import { isKingOfCourtMatchType } from '../../painel/data/koc';
import { kocBarOf, kocRoundTitleOf, type OverlayKocBar } from './overlay-koc-bar';
import { matchClosedSets, matchLiveCurrentSet, matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { pointAlertOf, type PointAlert } from '../../painel/telao/telao-final-mode';
import { targetPointsForSet } from '@nexago/live-scoring';

export type OverlayPhase = 'pregame' | 'live' | 'final';

export interface OverlaySide {
  teamId: string;
  label: string;
  serving: boolean;
}

/** Coluna de set no placar (fechado ou em andamento com traço). */
export interface OverlayDuelSetColumn {
  index: number;
  label: string;
  a: number | null;
  b: number | null;
  active: boolean;
}

export interface OverlayDuelView {
  kind: 'duel';
  phase: OverlayPhase;
  a: OverlaySide;
  b: OverlaySide;
  setsA: number;
  setsB: number;
  pointsA: number | null;
  pointsB: number | null;
  alert: PointAlert | null;
  /** Partida de set único nunca sai de 0-0 em sets — a coluna só ocuparia espaço no ar. */
  showSets: boolean;
  /** Quem lidera o set corrente (`null` = empate / sem pontos). */
  pointsLead: 'A' | 'B' | null;
  /** Set em curso (1-based) pra faixa "SET 2 · ATÉ 21". */
  currentSetNumber: number;
  targetPoints: number;
  setColumns: OverlayDuelSetColumn[];
  /** Fase/rodada já rotulada (`Semifinal`, …). */
  roundLabel: string | null;
  /** Vencedor quando `phase === 'final'`. */
  winnerSide: 'A' | 'B' | null;
  /** Posição na dupla no saque (1 ou 2). Zero = ainda não declarado. */
  servingPlayerSlot: 0 | 1 | 2;
}

export interface OverlayKocView {
  kind: 'koc';
  phase: OverlayPhase;
  /** "Classificatória · Rodada 3/7" — o total só entra quando foi possível contar; com mais de
   *  uma bateria na chave vira "Classificatória · Chave 4 · Bateria 3" e o total some (a chave e
   *  a bateria já localizam a rodada sozinhas). Ver `kocRoundTitleOf`. */
  roundTitle: string;
  bar: OverlayKocBar;
}

export type OverlayView = OverlayDuelView | OverlayKocView | null;

function sideOf(teamId: string, label: string, servingTeamId: string): OverlaySide {
  return { teamId, label, serving: teamId !== '' && teamId === servingTeamId };
}

function phaseOf(status: TournamentMatch['status']): OverlayPhase {
  if (status === 'in_progress') return 'live';
  if (status === 'completed') return 'final';
  return 'pregame';
}

function pointsLeadOf(a: number | null, b: number | null): 'A' | 'B' | null {
  if (a == null || b == null) return null;
  if (a > b) return 'A';
  if (b > a) return 'B';
  return null;
}

function winnerSideOf(match: TournamentMatch, setsA: number, setsB: number): 'A' | 'B' | null {
  if (match.status !== 'completed') return null;
  if (match.winnerSide === 1) return 'A';
  if (match.winnerSide === 2) return 'B';
  if (setsA > setsB) return 'A';
  if (setsB > setsA) return 'B';
  return null;
}

function setColumnsOf(
  match: TournamentMatch,
  closed: Array<{ a: number; b: number }>,
  live: { setNumber: number; a: number; b: number } | null,
): OverlayDuelSetColumn[] {
  if (match.bestOf <= 1) return [];
  const cols: OverlayDuelSetColumn[] = closed.map((s, i) => ({
    index: i,
    label: `SET ${i + 1}`,
    a: s.a,
    b: s.b,
    active: false,
  }));
  if (live) {
    cols.push({
      index: live.setNumber - 1,
      label: `SET ${live.setNumber}`,
      a: null,
      b: null,
      active: true,
    });
  } else if (cols.length > 0 && match.status === 'completed') {
    cols[cols.length - 1]!.active = true;
  }
  return cols;
}

export function overlayViewOf(
  match: TournamentMatch | null,
  nowMs: number,
  totalRounds = 0,
): OverlayView {
  if (!match) return null;
  if (match.status === 'canceled') return null;

  // Rodada KOTC não tem dois lados: `teamAId`/`teamBId` vêm vazios e o elenco vive em `koc`.
  // Sai antes de qualquer leitura de duelo — ver `koc.ts`.
  if (isKingOfCourtMatchType(match.matchType)) {
    const round = match.koc;
    // `kocRoundStateFrom` sempre devolve um objeto — rodada sem `kocState` no doc chega aqui
    // com ids vazios. Sem rei e desafiante não há duelo pra mostrar, e duas linhas em branco
    // por cima do vídeo são piores que overlay nenhum.
    if (!round || round.kingTeamId === '' || round.challengerTeamId === '') return null;
    return {
      kind: 'koc',
      phase: phaseOf(match.status),
      roundTitle: kocRoundTitleOf(match.matchType, round.roundLabel, match.matchNumber, totalRounds, {
        poolId: round.poolId,
        batteryLabel: round.batteryLabel,
        bracketsInPhase: round.bracketsInPhase,
      }),
      bar: kocBarOf(round, nowMs, totalRounds),
    };
  }

  const [setsA, setsB] = matchSetWins(match);
  // Ao vivo, os pontos são os do set em curso. Encerrada, são os do último set fechado: numa
  // partida de set único a coluna de sets nem aparece, e sem isto o overlay ficaria só com
  // traços no lugar do resultado.
  const closed = matchClosedSets(match);
  const live = matchLiveCurrentSet(match);
  const points = live ?? (match.status === 'completed' ? closed.at(-1) ?? null : null);
  const pointsA = points?.a ?? null;
  const pointsB = points?.b ?? null;
  const currentSetNumber = live?.setNumber ?? Math.max(1, closed.length);
  const targetPoints = targetPointsForSet(Math.max(0, currentSetNumber - 1), match.bestOf);
  return {
    kind: 'duel',
    phase: phaseOf(match.status),
    a: sideOf(match.teamAId, match.team1Label, match.servingTeamId),
    b: sideOf(match.teamBId, match.team2Label, match.servingTeamId),
    setsA,
    setsB,
    pointsA,
    pointsB,
    alert: pointAlertOf(match),
    showSets: match.bestOf > 1,
    pointsLead: pointsLeadOf(pointsA, pointsB),
    currentSetNumber,
    targetPoints,
    setColumns: setColumnsOf(match, closed, live),
    roundLabel: match.round?.trim() || null,
    winnerSide: winnerSideOf(match, setsA, setsB),
    servingPlayerSlot:
      match.servingPlayerSlot === 1 || match.servingPlayerSlot === 2 ? match.servingPlayerSlot : 0,
  };
}

export type OverlayCorner = 'tl' | 'tr' | 'bl' | 'br';

const OVERLAY_CORNERS: readonly string[] = ['tl', 'tr', 'bl', 'br'];

/** Canto pedido em `?pos=`. Valor desconhecido cai no padrão em vez de sumir com o placar —
 *  ninguém vai depurar query param no meio de uma transmissão. */
export function overlayCornerOf(raw: string | null): OverlayCorner {
  const v = (raw ?? '').trim().toLowerCase();
  return OVERLAY_CORNERS.includes(v) ? (v as OverlayCorner) : 'tl';
}

export function overlayBandOf(
  match: TournamentMatch,
  names: { tournamentName: string | null; categoryName: string | null },
): string {
  // `round` já vem rotulado por `roundLabelOf` (matches-repository) — inclusive
  // na rodada KOTC, onde ele diz a fase, a chave e a bateria. Passar por
  // `kocCardTitle` aqui era redundante: ela devolve esse mesmo `round`.
  return [names.tournamentName, names.categoryName, match.round, match.court]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' · ');
}

/** Ids de dupla que o overlay precisa resolver em nome. A rodada KOTC guarda o elenco em
 *  `koc.teamIds` — colher só `teamAId`/`teamBId` deixaria a rodada inteira sem nome, o mesmo
 *  defeito que já apareceu no card do app. */
export function overlayTeamIdsOf(match: TournamentMatch): string[] {
  const ids = [match.teamAId, match.teamBId, ...(match.koc?.teamIds ?? [])];
  return [...new Set(ids)].filter((id) => id !== '');
}
