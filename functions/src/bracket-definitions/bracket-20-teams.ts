import { MatchDefinition } from './bracket-definitions';

export const BRACKET_20_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 16 }, teamB: { type: 'SEED', seed: 17 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 13 }, teamB: { type: 'SEED', seed: 20 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 15 }, teamB: { type: 'SEED', seed: 18 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 14 }, teamB: { type: 'SEED', seed: 19 } },

    // WB R2
    { matchNumber: 5, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 9 } },
    { matchNumber: 6, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 12 } },
    { matchNumber: 7, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 10 } },
    { matchNumber: 8, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 6 }, teamB: { type: 'SEED', seed: 11 } },
    { matchNumber: 9, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'WINNER', matchNumber: 1} },
    { matchNumber: 10, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 4 }, teamB: { type: 'WINNER', matchNumber: 2 } },
    { matchNumber: 11, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 2 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    { matchNumber: 12, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'WINNER', matchNumber: 4 } },

    // LB R1
    { matchNumber: 13, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 11 } },
    { matchNumber: 14, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 2 }, teamB: { type: 'LOSER', matchNumber: 12 } },
    { matchNumber: 15, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 9 } },
    { matchNumber: 16, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 4 }, teamB: { type: 'LOSER', matchNumber: 10 } },

    // LB R2
    { matchNumber: 17, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 13 }, teamB: { type: 'LOSER', matchNumber: 7 } },
    { matchNumber: 18, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'LOSER', matchNumber: 8 } },
    { matchNumber: 19, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 15 }, teamB: { type: 'LOSER', matchNumber: 5 } },
    { matchNumber: 20, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'LOSER', matchNumber: 6 } },

    // WB R3
    { matchNumber: 21, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'WINNER', matchNumber: 9 } },
    { matchNumber: 22, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 6 }, teamB: { type: 'WINNER', matchNumber: 10 } },
    { matchNumber: 23, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 11 }, teamB: { type: 'WINNER', matchNumber: 7 } },
    { matchNumber: 24, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 8 }, teamB: { type: 'WINNER', matchNumber: 12 } },

    // LB R3
    { matchNumber: 25, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 17 }, teamB: { type: 'LOSER', matchNumber: 21 } },
    { matchNumber: 26, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 18 }, teamB: { type: 'LOSER', matchNumber: 22 } },
    { matchNumber: 27, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 19 }, teamB: { type: 'LOSER', matchNumber: 23 } },
    { matchNumber: 28, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 20 }, teamB: { type: 'LOSER', matchNumber: 24 } },

    // WB R4
    { matchNumber: 29, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 21 }, teamB: { type: 'WINNER', matchNumber: 22 } },
    { matchNumber: 30, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 24 }, teamB: { type: 'WINNER', matchNumber: 23 } },

    // LB R4
    { matchNumber: 31, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 26 }, teamB: { type: 'WINNER', matchNumber: 25 } },
    { matchNumber: 32, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 27 }, teamB: { type: 'WINNER', matchNumber: 28 } },

    // LB R5
    { matchNumber: 33, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 31 }, teamB: { type: 'LOSER', matchNumber: 30 } },
    { matchNumber: 34, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 32 }, teamB: { type: 'LOSER', matchNumber: 29 } },

    // WB R5
    { matchNumber: 35, bracket: 'WB', round: 5, teamA: { type: 'WINNER', matchNumber: 30 }, teamB: { type: 'WINNER', matchNumber: 29 } },

    // LB R6
    { matchNumber: 36, bracket: 'LB', round: 6, teamA: { type: 'WINNER', matchNumber: 33 }, teamB: { type: 'WINNER', matchNumber: 34 } },

    // Disputa 3º lugar
    { matchNumber: 37, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 36 }, teamB: { type: 'LOSER', matchNumber: 35 } },

    // FINAL (última partida)
    { matchNumber: 38, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 36 }, teamB: { type: 'WINNER', matchNumber: 35 } },
];

