import { MatchDefinition } from './bracket-definitions';

export const BRACKET_23_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 16 }, teamB: { type: 'SEED', seed: 17 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 13 }, teamB: { type: 'SEED', seed: 20 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 12 }, teamB: { type: 'SEED', seed: 21 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 15 }, teamB: { type: 'SEED', seed: 18 } },
    { matchNumber: 5, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 10 }, teamB: { type: 'SEED', seed: 23 } },
    { matchNumber: 6, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 14 }, teamB: { type: 'SEED', seed: 19 } },
    { matchNumber: 7, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 11 }, teamB: { type: 'SEED', seed: 22 } },

    // WB R2
    { matchNumber: 8, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 9 } },
    { matchNumber: 9, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    { matchNumber: 10, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 4 }, teamB: { type: 'WINNER', matchNumber: 2 } },
    { matchNumber: 11, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    { matchNumber: 12, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 2 }, teamB: { type: 'WINNER', matchNumber: 4 } },
    { matchNumber: 13, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'WINNER', matchNumber: 5 } },
    { matchNumber: 14, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'WINNER', matchNumber: 6 } },
    { matchNumber: 15, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 6 }, teamB: { type: 'WINNER', matchNumber: 7 } },

    // LB R1
    { matchNumber: 16, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 12 } },
    { matchNumber: 17, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 2 }, teamB: { type: 'LOSER', matchNumber: 14 } },
    { matchNumber: 18, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 15 } },
    { matchNumber: 19, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 4 }, teamB: { type: 'LOSER', matchNumber: 9 } },
    { matchNumber: 20, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 8 }, teamB: { type: 'LOSER', matchNumber: 5 } },
    { matchNumber: 21, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 10 }, teamB: { type: 'LOSER', matchNumber: 6 } },
    { matchNumber: 22, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 11 }, teamB: { type: 'LOSER', matchNumber: 7 } },

    // LB R2
    { matchNumber: 23, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'LOSER', matchNumber: 13 } },
    { matchNumber: 24, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 18 }, teamB: { type: 'WINNER', matchNumber: 17 } },
    { matchNumber: 25, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 19 }, teamB: { type: 'WINNER', matchNumber: 20 } },
    { matchNumber: 26, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 21 }, teamB: { type: 'WINNER', matchNumber: 22 } },

    // WB R3
    { matchNumber: 27, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 9 }, teamB: { type: 'WINNER', matchNumber: 8 } },
    { matchNumber: 28, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 10 }, teamB: { type: 'WINNER', matchNumber: 11 } },
    { matchNumber: 29, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 12 }, teamB: { type: 'WINNER', matchNumber: 13 } },
    { matchNumber: 30, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'WINNER', matchNumber: 15 } },

    // LB R3
    { matchNumber: 31, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 23 }, teamB: { type: 'LOSER', matchNumber: 27 } },
    { matchNumber: 32, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 24 }, teamB: { type: 'LOSER', matchNumber: 28 } },
    { matchNumber: 33, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 25 }, teamB: { type: 'LOSER', matchNumber: 29 } },
    { matchNumber: 34, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 26 }, teamB: { type: 'LOSER', matchNumber: 30 } },

    // WB R4
    { matchNumber: 35, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 27 }, teamB: { type: 'WINNER', matchNumber: 28 } },
    { matchNumber: 36, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 30 }, teamB: { type: 'WINNER', matchNumber: 29 } },

    // LB R4
    { matchNumber: 37, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 31 }, teamB: { type: 'WINNER', matchNumber: 32 } },
    { matchNumber: 38, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 33 }, teamB: { type: 'WINNER', matchNumber: 34 } },

    // LB R5
    { matchNumber: 39, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 37 }, teamB: { type: 'LOSER', matchNumber: 36 } },
    { matchNumber: 40, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 38 }, teamB: { type: 'LOSER', matchNumber: 35 } },

    // WB R5
    { matchNumber: 41, bracket: 'WB', round: 5, teamA: { type: 'WINNER', matchNumber: 35 }, teamB: { type: 'WINNER', matchNumber: 36 } },

    // LB R6
    { matchNumber: 42, bracket: 'LB', round: 6, teamA: { type: 'WINNER', matchNumber: 39 }, teamB: { type: 'WINNER', matchNumber: 40 } },

    // Disputa 3º lugar
    { matchNumber: 43, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 42 }, teamB: { type: 'LOSER', matchNumber: 41 } },

    // FINAL (última partida)
    { matchNumber: 44, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 42 }, teamB: { type: 'WINNER', matchNumber: 41 } },
];

