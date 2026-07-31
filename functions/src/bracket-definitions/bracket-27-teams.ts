import {MatchDefinition} from "./bracket-definitions";

/**
 * Dupla eliminação — 27 equipes (52 partidas).
 *
 * LB R1 tem 3 jogos de play-in: a WB R1 produz 11 perdedores e a LB R2 tem 16
 * vagas (8 perdedores da WB R2 + 8 do lado da R1) — 3 play-ins consomem 6
 * perdedores e sobram 5 vagas diretas (6 + 5 = 11). Com só 2 play-ins o
 * perdedor do #8 ficava fora da LB (eliminado com 1 derrota).
 */
export const BRACKET_27_TEAMS: MatchDefinition[] = [
    // WB R1
    {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 16}, teamB: {type: "SEED", seed: 17}},
    {matchNumber: 2, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 8}, teamB: {type: "SEED", seed: 25}},
    {matchNumber: 3, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 9}, teamB: {type: "SEED", seed: 24}},
    {matchNumber: 4, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 13}, teamB: {type: "SEED", seed: 20}},
    {matchNumber: 5, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 12}, teamB: {type: "SEED", seed: 21}},
    {matchNumber: 6, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 15}, teamB: {type: "SEED", seed: 18}},
    {matchNumber: 7, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 7}, teamB: {type: "SEED", seed: 26}},
    {matchNumber: 8, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 6}, teamB: {type: "SEED", seed: 27}},
    {matchNumber: 9, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 10}, teamB: {type: "SEED", seed: 23}},
    {matchNumber: 10, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 14}, teamB: {type: "SEED", seed: 19}},
    {matchNumber: 11, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 11}, teamB: {type: "SEED", seed: 22}},

    // LB R1
    {matchNumber: 12, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 2}, teamB: {type: "LOSER", matchNumber: 3}},
    {matchNumber: 13, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 7}, teamB: {type: "LOSER", matchNumber: 9}},
    {matchNumber: 14, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 8}, teamB: {type: "LOSER", matchNumber: 11}},

    // WB R2
    {matchNumber: 15, bracket: "WB", round: 2, teamA: {type: "SEED", seed: 1}, teamB: {type: "WINNER", matchNumber: 1}},
    {matchNumber: 16, bracket: "WB", round: 2, teamA: {type: "SEED", seed: 4}, teamB: {type: "WINNER", matchNumber: 4}},
    {matchNumber: 17, bracket: "WB", round: 2, teamA: {type: "SEED", seed: 5}, teamB: {type: "WINNER", matchNumber: 5}},
    {matchNumber: 18, bracket: "WB", round: 2, teamA: {type: "SEED", seed: 2}, teamB: {type: "WINNER", matchNumber: 6}},
    {matchNumber: 19, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 10}, teamB: {type: "WINNER", matchNumber: 7}},
    {matchNumber: 20, bracket: "WB", round: 2, teamA: {type: "SEED", seed: 3}, teamB: {type: "WINNER", matchNumber: 9}},
    {matchNumber: 21, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 11}, teamB: {type: "WINNER", matchNumber: 8}},
    {matchNumber: 22, bracket: "WB", round: 2, teamA: {type: "WINNER", matchNumber: 2}, teamB: {type: "WINNER", matchNumber: 3}},

    // LB R2
    {matchNumber: 23, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 18}, teamB: {type: "LOSER", matchNumber: 1}},
    {matchNumber: 24, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 19}, teamB: {type: "LOSER", matchNumber: 4}},
    {matchNumber: 25, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 20}, teamB: {type: "LOSER", matchNumber: 5}},
    {matchNumber: 26, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 15}, teamB: {type: "LOSER", matchNumber: 6}},
    {matchNumber: 27, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 16}, teamB: {type: "LOSER", matchNumber: 10}},
    {matchNumber: 28, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 17}, teamB: {type: "WINNER", matchNumber: 14}},
    {matchNumber: 29, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 22}, teamB: {type: "WINNER", matchNumber: 12}},
    {matchNumber: 30, bracket: "LB", round: 2, teamA: {type: "LOSER", matchNumber: 21}, teamB: {type: "WINNER", matchNumber: 13}},

    // WB R3
    {matchNumber: 31, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 15}, teamB: {type: "WINNER", matchNumber: 21}},
    {matchNumber: 32, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 16}, teamB: {type: "WINNER", matchNumber: 17}},
    {matchNumber: 33, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 18}, teamB: {type: "WINNER", matchNumber: 22}},
    {matchNumber: 34, bracket: "WB", round: 3, teamA: {type: "WINNER", matchNumber: 19}, teamB: {type: "WINNER", matchNumber: 20}},

    // LB R3
    {matchNumber: 35, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 23}, teamB: {type: "WINNER", matchNumber: 29}},
    {matchNumber: 36, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 24}, teamB: {type: "WINNER", matchNumber: 25}},
    {matchNumber: 37, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 26}, teamB: {type: "WINNER", matchNumber: 30}},
    {matchNumber: 38, bracket: "LB", round: 3, teamA: {type: "WINNER", matchNumber: 27}, teamB: {type: "WINNER", matchNumber: 28}},

    // LB R4
    {matchNumber: 39, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 35}, teamB: {type: "LOSER", matchNumber: 31}},
    {matchNumber: 40, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 36}, teamB: {type: "LOSER", matchNumber: 32}},
    {matchNumber: 41, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 37}, teamB: {type: "LOSER", matchNumber: 33}},
    {matchNumber: 42, bracket: "LB", round: 4, teamA: {type: "WINNER", matchNumber: 38}, teamB: {type: "LOSER", matchNumber: 34}},

    // WB R4
    {matchNumber: 43, bracket: "WB", round: 4, teamA: {type: "WINNER", matchNumber: 31}, teamB: {type: "WINNER", matchNumber: 32}},
    {matchNumber: 44, bracket: "WB", round: 4, teamA: {type: "WINNER", matchNumber: 33}, teamB: {type: "WINNER", matchNumber: 34}},

    // LB R5
    {matchNumber: 45, bracket: "LB", round: 5, teamA: {type: "WINNER", matchNumber: 39}, teamB: {type: "WINNER", matchNumber: 40}},
    {matchNumber: 46, bracket: "LB", round: 5, teamA: {type: "WINNER", matchNumber: 41}, teamB: {type: "WINNER", matchNumber: 42}},

    // LB R6
    {matchNumber: 47, bracket: "LB", round: 6, teamA: {type: "WINNER", matchNumber: 45}, teamB: {type: "LOSER", matchNumber: 44}},
    {matchNumber: 48, bracket: "LB", round: 6, teamA: {type: "WINNER", matchNumber: 46}, teamB: {type: "LOSER", matchNumber: 43}},

    // WB R5
    {matchNumber: 49, bracket: "WB", round: 5, teamA: {type: "WINNER", matchNumber: 43}, teamB: {type: "WINNER", matchNumber: 44}},

    // LB R7
    {matchNumber: 50, bracket: "LB", round: 7, teamA: {type: "WINNER", matchNumber: 47}, teamB: {type: "WINNER", matchNumber: 48}},

    // Disputa 3º lugar
    {matchNumber: 51, bracket: "THIRD_PLACE", round: 1, teamA: {type: "LOSER", matchNumber: 50}, teamB: {type: "LOSER", matchNumber: 49}},

    // FINAL (última partida)
    {matchNumber: 52, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 50}, teamB: {type: "WINNER", matchNumber: 49}},
];
