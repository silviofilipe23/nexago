import type {DrawGroupState} from "./draw-constraints";
import type {DrawPot} from "./draw-pots";

/**
 * Estrutura da sessão de sorteio: quantos grupos, de que tamanho, qual pote
 * está no ar em cada revelação, e quais números de seed a dupla eliminatória
 * deixa em aberto pro sorteio.
 *
 * Tudo aqui é determinístico — o acaso mora só na callable. Isso é o que
 * permite recriar a sessão e conferir o comprovante.
 */

/**
 * Grupos e suas capacidades. `teamsPerGroup` é o ALVO: com 14 duplas em grupos
 * de 4 saem quatro grupos de 4/4/3/3, e os maiores vêm primeiro — mesma conta
 * do snake draft da tela de Gerar chave, pra que o sorteio ao vivo e o fluxo
 * antigo produzam a mesma forma de chave.
 */
export function groupCapacities(teamCount: number, teamsPerGroup: number): DrawGroupState[] {
  if (teamCount <= 0) return [];
  const target = Math.max(2, Math.floor(teamsPerGroup) || 2);
  const groupCount = Math.max(1, Math.ceil(teamCount / target));
  const base = Math.floor(teamCount / groupCount);
  const remainder = teamCount % groupCount;

  return Array.from({length: groupCount}, (_, i) => ({
    groupId: String.fromCharCode(65 + i),
    capacity: base + (i < remainder ? 1 : 0),
    teamIds: [] as string[],
  }));
}

/**
 * Pote (1-based) da revelação de número `revealIndex` (1-based). `0` quando o
 * índice passa do fim — a callable lê isso como "sorteio encerrado", não erro.
 */
export function potIndexAt(pots: readonly DrawPot[], revealIndex: number): number {
  if (revealIndex < 1) return 0;
  let seen = 0;
  for (const pot of pots) {
    seen += pot.teamIds.length;
    if (revealIndex <= seen) return pot.index;
  }
  return 0;
}

export interface DeSeedSlots {
  /** Seeds ocupados pelas cabeças, sem sorteio. */
  locked: number[];
  /** Seeds que o sorteio ainda vai distribuir. */
  open: number[];
}

/**
 * Divisão dos números de seed na dupla eliminatória.
 *
 * As cabeças pegam os primeiros seeds na ordem do ranking — mostradas, não
 * sorteadas ("transparência antes da tensão"). O sorteio distribui o resto, e é
 * a planta que transforma cada número em confronto, bye e caminho.
 */
export function deSeedSlots(teamCount: number, lockedSeedCount: number): DeSeedSlots {
  const total = Math.max(0, Math.floor(teamCount));
  const locked = Math.min(Math.max(0, Math.floor(lockedSeedCount)), total);
  const seeds = Array.from({length: total}, (_, i) => i + 1);
  return {locked: seeds.slice(0, locked), open: seeds.slice(locked)};
}
