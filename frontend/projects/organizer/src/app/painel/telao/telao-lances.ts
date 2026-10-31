import type { BroadcastLances } from '../data/broadcast-lances';

/** ACE e MONSTER BLOCK no placar de quadra única (protótipos 37/38 do dono).
 *
 *  Não há botão próprio: o telão escuta o MESMO disparo dos "Lances" do painel de Transmissão
 *  (`broadcast/control.lances`) que o overlay do OBS mostra — um clique, os dois lugares. Só esses
 *  dois lances viram animação no LED; os outros são só da transmissão. */

/** A animação inteira (entra, segura e sai) — os keyframes do protótipo são frações disto. */
export const TELAO_LANCE_MS = 4500;

export type TelaoLanceTipo = 'ace' | 'block';

export interface TelaoLanceDisparo {
  seq: number;
  tipo: TelaoLanceTipo;
  lado: 'A' | 'B';
  atleta: 0 | 1;
}

/** O disparo que o telão deve animar agora, ou `null`.
 *
 *  `visto` = último `seq` já tratado (`null` = primeira leitura). Na primeira leitura só anima o
 *  que ainda caberia no ar — telão que liga no meio do evento não repete o ace de minutos atrás.
 *  O lance é da quadra que a Transmissão está seguindo (`control.courtId`): com o telão em outra
 *  quadra, não é com ele. */
export function telaoLanceDisparoOf(
  visto: number | null,
  lances: BroadcastLances,
  transmissaoCourtId: string | null,
  telaoCourtId: string,
  nowMs: number,
): TelaoLanceDisparo | null {
  if (lances.seq <= 0 || lances.seq === visto) return null;
  if (lances.tipo !== 'ace' && lances.tipo !== 'block') return null;
  if (transmissaoCourtId && transmissaoCourtId !== telaoCourtId) return null;
  if (visto === null && (lances.at === null || nowMs - lances.at.getTime() > TELAO_LANCE_MS)) return null;
  return { seq: lances.seq, tipo: lances.tipo, lado: lances.lado === 1 ? 'B' : 'A', atleta: lances.atleta };
}
