import { MatchDefinition } from './bracket-definitions';

export const BRACKET_26_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 16 }, teamB: { type: 'SEED', seed: 17 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 25 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 9 }, teamB: { type: 'SEED', seed: 24 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 13 }, teamB: { type: 'SEED', seed: 20 } },
    { matchNumber: 5, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 12 }, teamB: { type: 'SEED', seed: 21 } },
    { matchNumber: 6, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 15 }, teamB: { type: 'SEED', seed: 18 } },
    { matchNumber: 7, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 26 } },
    { matchNumber: 8, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 10 }, teamB: { type: 'SEED', seed: 23 } },
    { matchNumber: 9, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 14 }, teamB: { type: 'SEED', seed: 19 } },
    { matchNumber: 10, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 11 }, teamB: { type: 'SEED', seed: 22 } },

    // LB R1
    { matchNumber: 11, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 2 }, teamB: { type: 'LOSER', matchNumber: 3 } },
    { matchNumber: 12, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 7 }, teamB: { type: 'LOSER', matchNumber: 8 } },

    // WB R2
    { matchNumber: 13, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    { matchNumber: 14, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 4 }, teamB: { type: 'WINNER', matchNumber: 4 } },
    { matchNumber: 15, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'WINNER', matchNumber: 5 } },
    { matchNumber: 16, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 2 }, teamB: { type: 'WINNER', matchNumber: 6 } },
    { matchNumber: 17, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'WINNER', matchNumber: 7 } },
    { matchNumber: 18, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'WINNER', matchNumber: 8 } },
    { matchNumber: 19, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 6 }, teamB: { type: 'WINNER', matchNumber: 10 } },
    { matchNumber: 20, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 2 }, teamB: { type: 'WINNER', matchNumber: 3 } },

    // LB R2
    { matchNumber: 21, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 16 }, teamB: { type: 'LOSER', matchNumber: 1 } }, 
    { matchNumber: 22, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 17 }, teamB: { type: 'LOSER', matchNumber: 4 } },
    { matchNumber: 23, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 18 }, teamB: { type: 'LOSER', matchNumber: 5 } }, 
    { matchNumber: 24, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 13 }, teamB: { type: 'LOSER', matchNumber: 6 } },
    { matchNumber: 25, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 14 }, teamB: { type: 'LOSER', matchNumber: 9 } },
    { matchNumber: 26, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 15 }, teamB: { type: 'LOSER', matchNumber: 10 } },
    { matchNumber: 27, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 20 }, teamB: { type: 'WINNER', matchNumber: 11 } },
    { matchNumber: 28, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 19 }, teamB: { type: 'WINNER', matchNumber: 12 } },

    // WB R3
    { matchNumber: 29, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 13 }, teamB: { type: 'WINNER', matchNumber: 19 } },
    { matchNumber: 30, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'WINNER', matchNumber: 15 } },
    { matchNumber: 31, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'WINNER', matchNumber: 20 } },
    { matchNumber: 32, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 17 }, teamB: { type: 'WINNER', matchNumber: 18 } },

    // LB R3
    { matchNumber: 33, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 21 }, teamB: { type: 'WINNER', matchNumber: 27 } },
    { matchNumber: 34, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 22 }, teamB: { type: 'WINNER', matchNumber: 23 } },
    { matchNumber: 35, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 24 }, teamB: { type: 'WINNER', matchNumber: 28 } },
    { matchNumber: 36, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 25 }, teamB: { type: 'WINNER', matchNumber: 26 } },

    // LB R4
    { matchNumber: 37, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 33 }, teamB: { type: 'LOSER', matchNumber: 29 } },
    { matchNumber: 38, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 34 }, teamB: { type: 'LOSER', matchNumber: 30 } },
    { matchNumber: 39, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 35 }, teamB: { type: 'LOSER', matchNumber: 31 } },
    { matchNumber: 40, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 36 }, teamB: { type: 'LOSER', matchNumber: 32 } },

    // WB R4
    { matchNumber: 41, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 29 }, teamB: { type: 'WINNER', matchNumber: 30 } },
    { matchNumber: 42, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 31 }, teamB: { type: 'WINNER', matchNumber: 32 } },

    // LB R5
    { matchNumber: 43, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 37 }, teamB: { type: 'WINNER', matchNumber: 38 } },
    { matchNumber: 44, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 39 }, teamB: { type: 'WINNER', matchNumber: 40 } },

    // LB R6
    { matchNumber: 45, bracket: 'LB', round: 6, teamA: { type: 'WINNER', matchNumber: 43 }, teamB: { type: 'LOSER', matchNumber: 42 } },
    { matchNumber: 46, bracket: 'LB', round: 6, teamA: { type: 'WINNER', matchNumber: 44 }, teamB: { type: 'LOSER', matchNumber: 41 } },

    //WB R5
    { matchNumber: 47, bracket: 'WB', round: 5, teamA: { type: 'WINNER', matchNumber: 41 }, teamB: { type: 'WINNER', matchNumber: 42 } },

    //LB R7
    { matchNumber: 48, bracket: 'LB', round: 7, teamA: { type: 'WINNER', matchNumber: 45 }, teamB: { type: 'WINNER', matchNumber: 46 } },

    // Disputa 3º lugar
    { matchNumber: 49, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 48 }, teamB: { type: 'LOSER', matchNumber: 47 } },

    // FINAL (última partida)
    { matchNumber: 50, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 48 }, teamB: { type: 'WINNER', matchNumber: 47 } },
];
