import { isKingOfCourtMatchType, kocCardTitle } from '../../painel/data/koc';
import { kocBarOf, kocRoundTitleOf, type OverlayKocBar } from './overlay-koc-bar';
import { matchClosedSets, matchLiveCurrentSet, matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { pointAlertOf, type PointAlert } from '../../painel/telao/telao-final-mode';

export type OverlayPhase = 'pregame' | 'live' | 'final';

export interface OverlaySide {
  teamId: string;
  label: string;
  serving: boolean;
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
}

export interface OverlayKocView {
  kind: 'koc';
  phase: OverlayPhase;
  /** "Classificatória · Rodada 3/7" — o total só entra quando foi possível contar. */
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
      roundTitle: kocRoundTitleOf(match.matchType, round.roundLabel, match.matchNumber, totalRounds),
      bar: kocBarOf(round, nowMs, totalRounds),
    };
  }

  const [setsA, setsB] = matchSetWins(match);
  // Ao vivo, os pontos são os do set em curso. Encerrada, são os do último set fechado: numa
  // partida de set único a coluna de sets nem aparece, e sem isto o overlay ficaria só com
  // traços no lugar do resultado.
  const closed = matchClosedSets(match);
  const points = matchLiveCurrentSet(match) ?? (match.status === 'completed' ? closed.at(-1) ?? null : null);
  return {
    kind: 'duel',
    phase: phaseOf(match.status),
    a: sideOf(match.teamAId, match.team1Label, match.servingTeamId),
    b: sideOf(match.teamBId, match.team2Label, match.servingTeamId),
    setsA,
    setsB,
    pointsA: points?.a ?? null,
    pointsB: points?.b ?? null,
    alert: pointAlertOf(match),
    showSets: match.bestOf > 1,
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
  const phase = kocCardTitle(match) ?? match.round;
  return [names.tournamentName, names.categoryName, phase, match.court]
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
