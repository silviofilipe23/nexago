/** Ordem de entrada da rodada KOTC por sorteio de cartas.
 *
 *  Cada dupla tira uma carta do baralho; a maior começa no TRONO, a segunda
 *  desafia e as demais formam a fila, da maior para a menor. Resultado é a
 *  ordem de `kocTeamIds` que o `kocStartRound` aceita como permutação.
 *
 *  Pura de propósito (mesmo motivo de `koc-drift.ts`): a mesa não tem seam para
 *  teste de componente, então a regra mora aqui e a tela só a chama. */

/** Do menor para o maior — Ás é a carta mais alta. */
export const KOC_CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type KocCardRank = (typeof KOC_CARD_RANKS)[number];

/** Do menor para o maior, na ordem do truco: Ouros < Espadas < Copas < Paus.
 *  O naipe só desempata carta de mesmo valor, o que evita sorteio repetido. */
export const KOC_CARD_SUITS = ['diamonds', 'spades', 'hearts', 'clubs'] as const;
export type KocCardSuit = (typeof KOC_CARD_SUITS)[number];

export const KOC_SUIT_SYMBOL: Readonly<Record<KocCardSuit, string>> = {
  diamonds: '♦',
  spades: '♠',
  hearts: '♥',
  clubs: '♣',
};

export interface KocCard {
  rank: KocCardRank;
  suit: KocCardSuit;
}

/** Valor total da carta: o valor domina, o naipe desempata. */
export function kocCardScore(card: KocCard): number {
  return KOC_CARD_RANKS.indexOf(card.rank) * KOC_CARD_SUITS.length + KOC_CARD_SUITS.indexOf(card.suit);
}

export function kocCardLabel(card: KocCard): string {
  return `${card.rank}${KOC_SUIT_SYMBOL[card.suit]}`;
}

export type KocCardOrderResult =
  | { ok: true; order: string[] }
  | { ok: false; reason: 'missing' | 'duplicate'; teamIds: string[] };

/** Ordena as duplas pela carta, da maior para a menor.
 *
 *  Recusa em vez de adivinhar: dupla sem carta (`missing`) ou duas duplas com a
 *  MESMA carta (`duplicate` — num baralho só isso é erro de digitação). Devolve
 *  as duplas problemáticas para a tela marcá-las. */
export function kocOrderByCards(
  teamIds: readonly string[],
  cards: Readonly<Record<string, KocCard | undefined>>,
): KocCardOrderResult {
  const missing = teamIds.filter((id) => !cards[id]);
  if (missing.length > 0) return { ok: false, reason: 'missing', teamIds: missing };

  const byScore = new Map<number, string[]>();
  for (const id of teamIds) {
    const score = kocCardScore(cards[id]!);
    byScore.set(score, [...(byScore.get(score) ?? []), id]);
  }
  const duplicated = [...byScore.values()].filter((ids) => ids.length > 1).flat();
  if (duplicated.length > 0) return { ok: false, reason: 'duplicate', teamIds: duplicated };

  const order = [...teamIds].sort((a, b) => kocCardScore(cards[b]!) - kocCardScore(cards[a]!));
  return { ok: true, order };
}
