import { MatchDefinition } from './bracket-definitions';

/**
 * Dupla eliminação — 12 equipes (22 partidas).
 *
 * Transcrição da tabela impressa "TABELAS 12 DUPLAS — GOIÂNIA OPEN VÔLEI DE
 * PRAIA", cuja numeração de jogos (#1..#22) é preservada aqui como
 * `matchNumber`.
 *
 * O FECHAMENTO É O DA PLANTA DE 32, NÃO O DAS VIZINHAS (4–11, 13–27). Nelas a
 * WB vai até uma final única, a LB até a dela, e as duas se cruzam UMA vez na
 * grande final. Aqui a WB para com DOIS sobreviventes (#15 e #16, que nunca se
 * enfrentam) e a LB também com dois (#17 e #18); o cruzamento acontece DUAS
 * vezes, nas semifinais #19 e #20 — cada sobrevivente da WB pega o da LB do
 * lado oposto. Os vencedores fazem a final (#22) e os perdedores o 3º lugar
 * (#21). Quem conferir esta planta contra a de 11 ou a de 13 vai achar que
 * falta a "final da WB". Não falta. A garantia da dupla eliminação continua de
 * pé: ninguém sai com uma derrota só, e o campeão termina com no máximo uma.
 *
 * As semifinais #19/#20 estão no bracket "WB" (rodada 4), não LB, pelo mesmo
 * motivo da planta de 32: `BracketName` não tem nome para "cruzamento", e
 * marcá-las como LB faria `resolveDoubleEliminationLbPlacement` premiar o
 * perdedor com um degrau de 5º-8º ANTES de ele jogar o 3º lugar. Partidas de
 * WB não concedem colocação nenhuma, e o pódio inteiro fica com #21 e #22.
 *
 * SEMEADURA (a tabela impressa deixa as caixas em branco — a regra é do dono).
 * `seed: N` é a POSIÇÃO NO RANKING, porque o painel manda `seeds` na ordem da
 * tela sem redistribuir nada; a planta é o único lugar onde a distribuição
 * acontece. Os quatro primeiros têm bye e estreiam na R2; cada um pega o
 * vencedor de um confronto que soma 17 (7×10, 6×11, 8×9, 5×12), e os blocos
 * são armados para que as quartas saiam 1º×4º (#15) e 2º×3º (#16) — o 1º e o
 * 2º nunca se cruzam dentro da WB, só poderiam se encontrar na final.
 *
 * `bracket-12-teams.test.ts` trava o fechamento, o cruzamento dos ramos e o
 * bracket das semifinais.
 */
export const BRACKET_12_TEAMS: MatchDefinition[] = [
    // WB R1 — só as 8 duplas sem bye
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 10 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 6 }, teamB: { type: 'SEED', seed: 11 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 9 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 12 } },

    // WB R2 — entram os quatro primeiros do ranking
    { matchNumber: 5, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 2 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    { matchNumber: 6, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'WINNER', matchNumber: 2 } },
    { matchNumber: 7, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    { matchNumber: 8, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 4 }, teamB: { type: 'WINNER', matchNumber: 4 } },

    // LB R1 — perdedor da R1 contra perdedor da R2, cruzados (P1×P8, P2×P7…),
    // para que ninguém reencontre logo quem acabou de eliminá-lo
    { matchNumber: 9, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 8 } },
    { matchNumber: 10, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 2 }, teamB: { type: 'LOSER', matchNumber: 7 } },
    { matchNumber: 11, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 6 } },
    { matchNumber: 12, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 4 }, teamB: { type: 'LOSER', matchNumber: 5 } },

    // LB R2
    { matchNumber: 13, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 9 }, teamB: { type: 'WINNER', matchNumber: 10 } },
    { matchNumber: 14, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 11 }, teamB: { type: 'WINNER', matchNumber: 12 } },

    // WB R3 (quartas) — os dois sobreviventes não se enfrentam; vão às semifinais
    { matchNumber: 15, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 7 }, teamB: { type: 'WINNER', matchNumber: 8 } },
    { matchNumber: 16, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'WINNER', matchNumber: 6 } },

    // LB R3 — entram os 2 perdedores das quartas, cada um no ramo OPOSTO ao da
    // semifinal que a sua quarta alimenta (#15 desce no ramo de #19)
    { matchNumber: 17, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'LOSER', matchNumber: 15 } },
    { matchNumber: 18, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 13 }, teamB: { type: 'LOSER', matchNumber: 16 } },

    // Semifinais — cada sobrevivente da WB pega o da LB do lado oposto
    { matchNumber: 19, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'WINNER', matchNumber: 17 } },
    { matchNumber: 20, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 15 }, teamB: { type: 'WINNER', matchNumber: 18 } },

    // Disputa 3º lugar
    { matchNumber: 21, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 19 }, teamB: { type: 'LOSER', matchNumber: 20 } },

    // FINAL (última partida)
    { matchNumber: 22, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 19 }, teamB: { type: 'WINNER', matchNumber: 20 } },
];
