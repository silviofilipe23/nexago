import { MatchDefinition } from './bracket-definitions';

/**
 * Dupla eliminação — 16 equipes (30 partidas). Planta CHEIA: toda dupla joga a
 * estreia, como as de 4, 8 e 32.
 *
 * QUEM DECIDE A ALTURA DE CADA JOGO É A FIAÇÃO, NÃO O NÚMERO. O layout das três
 * superfícies (`bracket-tree.ts` nos portais, `double_elimination_bracket_layout.dart`
 * no app) empilha os alimentadores de uma partida pelo SLOT em que entram: quem
 * avança pro `teamA` fica ACIMA de quem avança pro `teamB`. Por isso a final da
 * WB (#27) lista `WINNER(#21)` antes do `WINNER(#22)` e a final da LB (#28)
 * lista `WINNER(#25)` antes do `WINNER(#26)` — inverter qualquer uma vira a
 * metade inteira daquele lado de cabeça pra baixo e o desenho passa a começar
 * pelo jogo #5 (era o estado até 09/2026, e derrubava junto o cruzamento
 * descrito abaixo). `bracket-definitions.test.ts` trava as duas ordens.
 *
 * SEMEADURA: `seed: N` é a POSIÇÃO NO RANKING — o painel manda `seeds` na ordem
 * da tela sem redistribuir, então a planta é o único lugar onde a distribuição
 * acontece. Quartas 1×8, 4×5, 2×7 e 3×6 (a mesma ordem da planta de 8), semis
 * 1×4 e 2×3, e o 1º só encontra o 2º na final da WB. O 1º do ranking abre o
 * jogo #1 porque a estreia dele é o topo do desenho.
 */
export const BRACKET_16_TEAMS: MatchDefinition[] = [
    // WB R1 — metade de CIMA (#1-4): quartas 1×8 e 4×5
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'SEED', seed: 16 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 9 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 4 }, teamB: { type: 'SEED', seed: 13 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 12 } },
    // WB R1 — metade de BAIXO (#5-8): quartas 2×7 e 3×6
    { matchNumber: 5, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 2 }, teamB: { type: 'SEED', seed: 15 } },
    { matchNumber: 6, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 10 } },
    { matchNumber: 7, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 14 } },
    { matchNumber: 8, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 6 }, teamB: { type: 'SEED', seed: 11 } },

    // LB R1 — entrada CRUZADA: quem perde na metade de cima da WB cai na metade
    // de baixo da LB, e vice-versa ("perdi em cima, vou pra baixo", que é como
    // o atleta lê a tabela). A fiação sequencial é o conserto óbvio que alguém
    // faria achando que a inversão é deslize — e antecipa o reencontro.
    // O espelho da entrada da R2 acompanha o cruzamento: desalinhar os dois é
    // o que derruba o teto de reencontro (ver bracket-definitions.test.ts).
    { matchNumber: 9, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 5 }, teamB: { type: 'LOSER', matchNumber: 6 } },
    { matchNumber: 10, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 7 }, teamB: { type: 'LOSER', matchNumber: 8 } },
    { matchNumber: 11, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 2 } },
    { matchNumber: 12, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 4 } },

    // WB R2
    { matchNumber: 13, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 1 }, teamB: { type: 'WINNER', matchNumber: 2 } },
    { matchNumber: 14, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 3 }, teamB: { type: 'WINNER', matchNumber: 4 } },
    { matchNumber: 15, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'WINNER', matchNumber: 6 } },
    { matchNumber: 16, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 7 }, teamB: { type: 'WINNER', matchNumber: 8 } },

    // LB R2
    { matchNumber: 17, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 14 }, teamB: { type: 'WINNER', matchNumber: 9 } },
    { matchNumber: 18, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 13 }, teamB: { type: 'WINNER', matchNumber: 10 } },
    { matchNumber: 19, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 16 }, teamB: { type: 'WINNER', matchNumber: 11 } },
    { matchNumber: 20, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 15 }, teamB: { type: 'WINNER', matchNumber: 12 } },

    // WB R3
    { matchNumber: 21, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 13 }, teamB: { type: 'WINNER', matchNumber: 14 } },
    { matchNumber: 22, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 15 }, teamB: { type: 'WINNER', matchNumber: 16 } },

    // LB R3
    { matchNumber: 23, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 17 }, teamB: { type: 'WINNER', matchNumber: 18 } },
    { matchNumber: 24, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 19 }, teamB: { type: 'WINNER', matchNumber: 20 } },

    // LB R4 — entram os 2 perdedores da WB R3, cruzados (#22 no de cima)
    { matchNumber: 25, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 23 }, teamB: { type: 'LOSER', matchNumber: 22 } },
    { matchNumber: 26, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 24 }, teamB: { type: 'LOSER', matchNumber: 21 } },

    // WB R4
    { matchNumber: 27, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 21 }, teamB: { type: 'WINNER', matchNumber: 22 } },

    // LB R5
    { matchNumber: 28, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 25 }, teamB: { type: 'WINNER', matchNumber: 26 } },

    // Disputa 3º lugar
    { matchNumber: 29, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 28 }, teamB: { type: 'LOSER', matchNumber: 27 } },

    // FINAL (última partida)
    { matchNumber: 30, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 28 }, teamB: { type: 'WINNER', matchNumber: 27 } },
];
