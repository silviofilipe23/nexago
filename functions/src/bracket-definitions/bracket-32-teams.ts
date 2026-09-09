import {MatchDefinition} from "./bracket-definitions";

/**
 * Dupla eliminação — 32 equipes (62 partidas).
 *
 * Transcrição da tabela impressa "TABELA 32 DUPLAS", cuja numeração de jogos
 * (#1..#62) é preservada aqui como `matchNumber`.
 *
 * O FECHAMENTO DIFERE DAS DEMAIS PLANTAS (4–27). Lá a WB vai até uma final
 * única, a LB até a dela, e as duas se cruzam UMA vez na grande final. Aqui a
 * WB para com DOIS sobreviventes (#53 e #54, que nunca se enfrentam) e a LB
 * também com dois (#57 e #58); o cruzamento acontece DUAS vezes, nas
 * semifinais #59 e #60 — cada semifinalista da WB pega o finalista do lado
 * oposto da LB. Os vencedores fazem a final (#62) e os perdedores o 3º lugar
 * (#61). A garantia da dupla eliminação continua de pé: ninguém sai com uma
 * derrota só, e o campeão termina com no máximo uma.
 *
 * As semifinais #59/#60 estão no bracket "WB" (rodada 5) porque `BracketName`
 * não tem um nome para "cruzamento": marcá-las como LB faria o resolvedor de
 * colocação premiar o perdedor com um degrau de 5º-8º ANTES de ele jogar o 3º
 * lugar (`resolveDoubleEliminationLbPlacement`), enquanto partidas de WB não
 * concedem colocação nenhuma e deixam o pódio inteiro para #61 e #62.
 *
 * SEMEADURA (a tabela impressa deixa as caixas em branco — a regra é do dono).
 * `seed: N` é a POSIÇÃO NO RANKING, porque o painel manda `seeds` na ordem da
 * tela sem redistribuir nada; a planta é o único lugar onde a distribuição
 * acontece. As demais plantas (4–27) casam seed 1 com seed 2 já na estreia —
 * aqui NÃO, e essa diferença é deliberada:
 *
 *  - cada partida da R1 é cabeça × complemento, somando sempre 33
 *    (1×32, 2×31, 3×30 …), então ninguém pega um adversário fora da sua faixa;
 *  - os quatro primeiros abrem nas PONTAS dos quatro quadrantes — 1º no #1,
 *    4º no #8, 3º no #9, 2º no #16 — e por isso não se cruzam antes das
 *    semifinais da WB: #53 sai 1º×4º e #54 sai 3º×2º;
 *  - os cabeças 5–8 entram na ponta oposta do quadrante do seu par de quartas
 *    (1v8, 4v5, 3v6, 2v7) e os 9–16 completam os blocos da R2 (1v16, 8v9,
 *    5v12, 4v13, 3v14, 6v11, 7v10, 2v15).
 *
 * O efeito é o do bracket semeado canônico, com 2º e 3º trocados de quadrante
 * e cada cabeça na ponta em vez da posição canônica. `bracket-32-teams.test.ts`
 * trava as quatro âncoras, a soma 33 e as rodadas de reencontro — mexer na
 * ordem sem mexer no teste quebra o build de propósito.
 */
export const BRACKET_32_TEAMS: MatchDefinition[] = [
  // WB R1 — cabeça × complemento (soma 33); 1º/4º/3º/2º nas pontas
  //   quadrante A #1-4 → #41 ⌉                  quadrante C #9-12 → #43 ⌉
  //   quadrante B #5-8 → #42 ⌋→ #53 (1º×4º)     quadrante D #13-16 → #44 ⌋→ #54 (3º×2º)
  {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 32}},
  {matchNumber: 2, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 16}, teamB: {type: "SEED", seed: 17}},
  {matchNumber: 3, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 9}, teamB: {type: "SEED", seed: 24}},
  {matchNumber: 4, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 8}, teamB: {type: "SEED", seed: 25}},
  {matchNumber: 5, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 5}, teamB: {type: "SEED", seed: 28}},
  {matchNumber: 6, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 12}, teamB: {type: "SEED", seed: 21}},
  {matchNumber: 7, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 13}, teamB: {type: "SEED", seed: 20}},
  {matchNumber: 8, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 4}, teamB: {type: "SEED", seed: 29}},
  {matchNumber: 9, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 3}, teamB: {type: "SEED", seed: 30}},
  {matchNumber: 10, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 14}, teamB: {type: "SEED", seed: 19}},
  {matchNumber: 11, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 11}, teamB: {type: "SEED", seed: 22}},
  {matchNumber: 12, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 6}, teamB: {type: "SEED", seed: 27}},
  {matchNumber: 13, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 7}, teamB: {type: "SEED", seed: 26}},
  {matchNumber: 14, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 10}, teamB: {type: "SEED", seed: 23}},
  {matchNumber: 15, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 15}, teamB: {type: "SEED", seed: 18}},
  {matchNumber: 16, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 2}, teamB: {type: "SEED", seed: 31}},

  // WB R2
  {matchNumber: 17, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "WINNER", matchNumber: 2}},
  {matchNumber: 18, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 3}, teamB: {type: "WINNER", matchNumber: 4}},
  {matchNumber: 19, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 5}, teamB: {type: "WINNER", matchNumber: 6}},
  {matchNumber: 20, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 7}, teamB: {type: "WINNER", matchNumber: 8}},
  {matchNumber: 21, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 9}, teamB: {type: "WINNER", matchNumber: 10}},
  {matchNumber: 22, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 11}, teamB: {type: "WINNER", matchNumber: 12}},
  {matchNumber: 23, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 13}, teamB: {type: "WINNER", matchNumber: 14}},
  {matchNumber: 24, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 15}, teamB: {type: "WINNER", matchNumber: 16}},

  // LB R1 — os 16 perdedores da WB R1
  {matchNumber: 25, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "LOSER", matchNumber: 2}},
  {matchNumber: 26, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 3}, teamB: {type: "LOSER", matchNumber: 4}},
  {matchNumber: 27, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 5}, teamB: {type: "LOSER", matchNumber: 6}},
  {matchNumber: 28, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 7}, teamB: {type: "LOSER", matchNumber: 8}},
  {matchNumber: 29, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 9}, teamB: {type: "LOSER", matchNumber: 10}},
  {matchNumber: 30, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 11}, teamB: {type: "LOSER", matchNumber: 12}},
  {matchNumber: 31, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 13}, teamB: {type: "LOSER", matchNumber: 14}},
  {matchNumber: 32, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 15}, teamB: {type: "LOSER", matchNumber: 16}},

  // LB R2 — entram os 8 perdedores da WB R2, em ordem espelhada (#24 no #33)
  {matchNumber: 33, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 25}, teamB: {type: "LOSER", matchNumber: 24}},
  {matchNumber: 34, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 26}, teamB: {type: "LOSER", matchNumber: 23}},
  {matchNumber: 35, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 27}, teamB: {type: "LOSER", matchNumber: 22}},
  {matchNumber: 36, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 28}, teamB: {type: "LOSER", matchNumber: 21}},
  {matchNumber: 37, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 29}, teamB: {type: "LOSER", matchNumber: 20}},
  {matchNumber: 38, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 30}, teamB: {type: "LOSER", matchNumber: 19}},
  {matchNumber: 39, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 31}, teamB: {type: "LOSER", matchNumber: 18}},
  {matchNumber: 40, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 32}, teamB: {type: "LOSER", matchNumber: 17}},

  // WB R3
  {matchNumber: 41, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 17}, teamB: {type: "WINNER", matchNumber: 18}},
  {matchNumber: 42, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 19}, teamB: {type: "WINNER", matchNumber: 20}},
  {matchNumber: 43, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 21}, teamB: {type: "WINNER", matchNumber: 22}},
  {matchNumber: 44, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 23}, teamB: {type: "WINNER", matchNumber: 24}},

  // LB R3
  {matchNumber: 45, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 33}, teamB: {type: "WINNER", matchNumber: 34}},
  {matchNumber: 46, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 35}, teamB: {type: "WINNER", matchNumber: 36}},
  {matchNumber: 47, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 37}, teamB: {type: "WINNER", matchNumber: 38}},
  {matchNumber: 48, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 39}, teamB: {type: "WINNER", matchNumber: 40}},

  // LB R4 — entram os 4 perdedores da WB R3, cruzados dentro de cada metade
  {matchNumber: 49, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 45}, teamB: {type: "LOSER", matchNumber: 42}},
  {matchNumber: 50, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 46}, teamB: {type: "LOSER", matchNumber: 41}},
  {matchNumber: 51, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 47}, teamB: {type: "LOSER", matchNumber: 44}},
  {matchNumber: 52, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 48}, teamB: {type: "LOSER", matchNumber: 43}},

  // WB R4 — os dois sobreviventes da WB não se enfrentam; vão às semifinais
  {matchNumber: 53, bracket: "WB", round: 4, teamA: {type: "WINNER", matchNumber: 41}, teamB: {type: "WINNER", matchNumber: 42}},
  {matchNumber: 54, bracket: "WB", round: 4, teamA: {type: "WINNER", matchNumber: 43}, teamB: {type: "WINNER", matchNumber: 44}},

  // LB R5
  {matchNumber: 55, bracket: "LB", round: 5, teamA: {type: "WINNER", matchNumber: 49}, teamB: {type: "WINNER", matchNumber: 50}},
  {matchNumber: 56, bracket: "LB", round: 5, teamA: {type: "WINNER", matchNumber: 51}, teamB: {type: "WINNER", matchNumber: 52}},

  // LB R6 — entram os 2 perdedores da WB R4, cruzados (#54 no #57)
  {matchNumber: 57, bracket: "LB", round: 6, teamA: {type: "WINNER", matchNumber: 55}, teamB: {type: "LOSER", matchNumber: 54}},
  {matchNumber: 58, bracket: "LB", round: 6, teamA: {type: "WINNER", matchNumber: 56}, teamB: {type: "LOSER", matchNumber: 53}},

  // Semifinais — cada sobrevivente da WB pega o da LB do lado oposto
  {matchNumber: 59, bracket: "WB", round: 5, teamA: {type: "WINNER", matchNumber: 53}, teamB: {type: "WINNER", matchNumber: 57}},
  {matchNumber: 60, bracket: "WB", round: 5, teamA: {type: "WINNER", matchNumber: 54}, teamB: {type: "WINNER", matchNumber: 58}},

  // Disputa 3º lugar
  {matchNumber: 61, bracket: "THIRD_PLACE", round: 1, teamA: {type: "LOSER", matchNumber: 59}, teamB: {type: "LOSER", matchNumber: 60}},

  // FINAL (última partida)
  {matchNumber: 62, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 59}, teamB: {type: "WINNER", matchNumber: 60}},
];
