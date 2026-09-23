import { isKingOfCourtMatchType, kocIsExpired } from '../../painel/data/koc';
import { kocPreRoundOf } from '../overlay/overlay-koc-preround';
import type { TournamentMatch } from '../../painel/data/matches-repository';

export type LedTela =
  | 'elenco'
  | 'jogo'
  | 'tempo-esgotado'
  | 'classificacao'
  | 'classificadas'
  | 'aguardando';

export const CLASSIFICACAO_MS = 15_000;
export const CLASSIFICADAS_MS = 15_000;

/** Qual tela o painel mostra agora.
 *
 *  O relógio zerado NÃO encerra a rodada: `kocFinishRound` exige mesário autenticado e se recusa a
 *  fechar quando há empate no corte, porque a bola de ouro é jogada na areia. O painel segura em
 *  TEMPO ESGOTADO — pelo tempo que for — e só vira quando a mesa encerra de verdade. */
export function ledTelaOf(
  match: TournamentMatch | null,
  nowMs: number,
  finishedAtMs: number | null,
): LedTela {
  if (!match || !isKingOfCourtMatchType(match.matchType) || !match.koc) return 'aguardando';

  if (match.status === 'completed') {
    if (finishedAtMs == null) return 'classificacao';
    const desde = nowMs - finishedAtMs;
    if (desde < CLASSIFICACAO_MS) return 'classificacao';
    if (desde < CLASSIFICACAO_MS + CLASSIFICADAS_MS) return 'classificadas';
    return 'aguardando';
  }

  // Antes do apito não há rei nem desafiante: o que existe é a ordem de entrada. Sem elenco
  // resolvido (fase cujas vagas ainda dependem da anterior) não há quem anunciar.
  if (match.status === 'scheduled') {
    return kocPreRoundOf(match) ? 'elenco' : 'aguardando';
  }

  const clock = match.koc.clock;
  // Pausada congela o cronômetro, então não "esgota" enquanto a mesa segura o jogo.
  if (clock && clock.pausedAtMs == null && kocIsExpired(clock, nowMs)) return 'tempo-esgotado';
  return 'jogo';
}
