import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OverlayDuelView } from './overlay-selectors';

/** Bolão ao vivo: a divisão dos palpites da partida entre as duas duplas. Puro — a tela só desenha.
 *
 *  Os palpites vêm de `tournamentPredictions/{torneio}/entries` (um doc por apostador com o mapa
 *  `picks: {partida: teamId}`); o gateway conta quantos apontaram cada dupla.
 *
 *  Fases: ABERTO enquanto a partida está agendada; ENCERRADO quando ela começa (o servidor só aceita
 *  palpite com a partida agendada) ou o horário previsto passa; RESULTADO quando termina. O prazo
 *  mostrado é uma ESTIMATIVA: a partida só fecha de fato quando é iniciada na mesa. */

export type BolaoFase = 'aberto' | 'encerrado' | 'resultado';

export interface BolaoContagem {
  a: number;
  b: number;
}

export interface BolaoLado {
  teamId: string;
  label: string;
  count: number;
  /** 0–100, inteiro; os dois lados sempre somam 100 (50/50 sem palpites). */
  pct: number;
}

export interface BolaoView {
  fase: BolaoFase;
  a: BolaoLado;
  b: BolaoLado;
  total: number;
  /** Segundos até o horário previsto (estimativa); `null` sem horário ou fora da fase aberta. */
  restanteSeg: number | null;
  court: string | null;
  category: string | null;
  /** Resultado: dupla vencedora e quem acertou. */
  vencedor: 'A' | 'B' | null;
  acertaram: { n: number; pct: number } | null;
}

/** Percentuais inteiros que somam 100: o 2º lado fica com o resto. */
export function bolaoPercentuais(a: number, b: number): [number, number] {
  const total = a + b;
  if (total <= 0) return [50, 50];
  const pa = Math.round((a / total) * 100);
  return [pa, 100 - pa];
}

export function bolaoViewOf(
  match: TournamentMatch | null,
  v: OverlayDuelView | null,
  contagem: BolaoContagem,
  nowMs: number,
  names: { court: string | null; category: string | null },
): BolaoView | null {
  if (!match || !v || match.status === 'canceled' || match.teamAId === '' || match.teamBId === '') return null;
  const total = contagem.a + contagem.b;
  const [pa, pb] = bolaoPercentuais(contagem.a, contagem.b);

  const previsto = match.scheduledAt?.getTime() ?? null;
  const restanteSeg = match.status === 'scheduled' && previsto != null ? Math.max(0, Math.ceil((previsto - nowMs) / 1000)) : null;

  let fase: BolaoFase;
  if (match.status === 'completed') fase = 'resultado';
  else if (match.status === 'in_progress' || restanteSeg === 0) fase = 'encerrado';
  else fase = 'aberto';

  const vencedor: 'A' | 'B' | null = fase === 'resultado' ? (v.winnerSide ?? null) : null;
  const acertaram = vencedor ? { n: vencedor === 'A' ? contagem.a : contagem.b, pct: vencedor === 'A' ? pa : pb } : null;

  return {
    fase,
    a: { teamId: v.a.teamId, label: v.a.label, count: contagem.a, pct: pa },
    b: { teamId: v.b.teamId, label: v.b.label, count: contagem.b, pct: pb },
    total,
    restanteSeg: fase === 'aberto' ? restanteSeg : null,
    court: names.court,
    category: names.category,
    vencedor,
    acertaram,
  };
}
