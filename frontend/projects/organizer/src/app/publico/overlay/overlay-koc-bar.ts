import {
  kocPhaseLabel,
  kocPointsOf,
  kocRemainingLabel,
  normalizeMatchType,
  type KocRoundState,
} from '../../painel/data/koc';

export type KocBlockRole = 'queue' | 'challenger' | 'king';

export interface OverlayKocBlock {
  role: KocBlockRole;
  teamId: string;
  points: number;
  nextUp: boolean;
}

export interface OverlayKocBar {
  blocks: OverlayKocBlock[];
  /** Defesas seguidas do rei; `null` abaixo do piso — selo que não significa nada só polui. */
  streak: number | null;
  clock: { label: string; paused: boolean } | null;
}

/** Blocos da esquerda para a direita, como a faixa é lida: fila do fundo até a frente, depois
 *  desafiante e rei. O rei fica colado no cronômetro de propósito — espelha o lado da quadra.
 *  `queue[0]` é quem entra a seguir, então a fila é desenhada invertida. */
/** Piso do selo, o mesmo do modo "em chamas" do telão. */
export const KOC_STREAK_FLOOR = 3;

/** Defesas seguidas do rei ATUAL, lidas do fim do log de rallies.
 *
 *  Vem do log (`kocRallies`), não da diferença entre snapshots como no telão: o log é
 *  determinístico, então recarregar a página no meio da transmissão não zera a conta.
 *  Coroação e bola de ouro encerram o reinado e quebram a sequência; erro de saque do
 *  desafiante é neutro — não é defesa, mas também não tira o rei do trono. */
export function kocStreakOf(rallyLog: readonly { winner: string }[]): number | null {
  let streak = 0;
  for (let i = rallyLog.length - 1; i >= 0; i--) {
    const winner = rallyLog[i].winner;
    if (winner === 'king') streak++;
    else if (winner === 'serve_fault') continue;
    else break;
  }
  return streak >= KOC_STREAK_FLOOR ? streak : null;
}

export function kocBarOf(round: KocRoundState, nowMs: number, totalRounds: number): OverlayKocBar {
  const nextUpId = round.queue[0] ?? '';
  const queue = [...round.queue].reverse().map<OverlayKocBlock>((teamId) => ({
    role: 'queue',
    teamId,
    points: kocPointsOf(round, teamId),
    nextUp: teamId === nextUpId,
  }));

  const inPlay = ([round.challengerTeamId, round.kingTeamId] as const).map<OverlayKocBlock>(
    (teamId, i) => ({
      role: i === 0 ? 'challenger' : 'king',
      teamId,
      points: kocPointsOf(round, teamId),
      nextUp: false,
    }),
  );

  return {
    blocks: [...queue, ...inPlay],
    streak: kocStreakOf(round.rallyLog),
    clock: round.clock
      ? { label: kocRemainingLabel(round.clock, nowMs), paused: round.clock.pausedAtMs != null }
      : null,
  };
}

export function kocRoundTitleOf(
  matchType: string,
  roundLabel: number,
  matchNumber: number,
  totalRounds: number,
): string {
  // `roundLabel` é a rodada DENTRO da fase; `matchNumber` é global e diria "Rodada 9" num campo
  // com duas classificatórias. Ver `koc.ts`.
  const base = kocPhaseLabel(matchType, roundLabel || matchNumber);
  const phase = normalizeMatchType(matchType);
  if (totalRounds <= 0 || phase === 'koc final' || phase === 'koc semifinal') return base;
  return `${base}/${totalRounds}`;
}
