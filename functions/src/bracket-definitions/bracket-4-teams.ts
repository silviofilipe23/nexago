import {MatchDefinition} from "./bracket-definitions";

/**
 * Dupla eliminação — 4 equipes (7 partidas).
 *
 * Estrutura clássica: o perdedor da final da WB (#4) desce para a final da LB
 * (#5) — tem "segunda chance".
 */
export const BRACKET_4_TEAMS: MatchDefinition[] = [
  // WB R1
  {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 4}},
  {matchNumber: 2, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 3}, teamB: {type: "SEED", seed: 2}},

  // LB R1 (perdedores da WB R1)
  {matchNumber: 3, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "LOSER", matchNumber: 2}},

  // WB R2 (final da WB)
  {matchNumber: 4, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "WINNER", matchNumber: 2}},

  // LB R2 (final da LB): vencedor da LB R1 vs perdedor da final da WB.
  {matchNumber: 5, bracket: "LB", round: 2, teamA: {type: "WINNER", matchNumber: 3}, teamB: {type: "LOSER", matchNumber: 4}},

  // Disputa de 3º lugar: os dois eliminados na LB.
  // NOTA: o exemplo original usava LOSER(4) aqui, mas o perdedor de #4 já desce
  // para #5 (não pode ter dois destinos). O 3º lugar é entre o perdedor da
  // final da LB (#5) e o perdedor da LB R1 (#3).
  {matchNumber: 6, bracket: "THIRD_PLACE", round: 1, teamA: {type: "LOSER", matchNumber: 3}, teamB: {type: "LOSER", matchNumber: 5}},

  // FINAL (última partida): campeão WB vs campeão LB.
  {matchNumber: 7, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 4}, teamB: {type: "WINNER", matchNumber: 5}},
];
