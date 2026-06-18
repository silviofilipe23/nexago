import { MatchDefinition } from './bracket-definitions';

export const BRACKET_18_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 17 }, teamB: { type: 'SEED', seed: 16 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 15 }, teamB: { type: 'SEED', seed: 18 } },

    // WB R2
    { matchNumber: 3, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 9 } },
    { matchNumber: 4, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 4 }, teamB: { type: 'SEED', seed: 13 } },
    { matchNumber: 5, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 12 } },
    { matchNumber: 6, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 10 } },
    { matchNumber: 7, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 14 } },
    { matchNumber: 8, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 6 }, teamB: { type: 'SEED', seed: 11 } },
    { matchNumber: 9, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'WINNER', matchNumber: 1 } },   
    { matchNumber: 10, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 2 }, teamB: { type: 'WINNER', matchNumber: 2 } },   

    // LB R1
    { matchNumber: 11, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 10 } },
    { matchNumber: 12, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 2 }, teamB: { type: 'LOSER', matchNumber: 9 } },

    // LB R2
    { matchNumber: 13, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 7 }, teamB: { type: 'LOSER', matchNumber: 8 } },
    { matchNumber: 14, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 4 }, teamB: { type: 'LOSER', matchNumber: 5 } },
    { matchNumber: 15, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 11 }, teamB: { type: 'LOSER', matchNumber: 6 } },
    { matchNumber: 16, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 12 }, teamB: { type: 'LOSER', matchNumber: 3 } },

    // WB R3
    { matchNumber: 17, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 3 }, teamB: { type: 'WINNER', matchNumber: 9 } },
    { matchNumber: 18, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 4 }, teamB: { type: 'WINNER', matchNumber: 5 } },
    { matchNumber: 19, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 6 }, teamB: { type: 'WINNER', matchNumber: 10 } },
    { matchNumber: 20, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 8 }, teamB: { type: 'WINNER', matchNumber: 7 } },

    // LB R3
    { matchNumber: 21, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 15 }, teamB: { type: 'LOSER', matchNumber: 17 } },
    { matchNumber: 22, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 13 }, teamB: { type: 'LOSER', matchNumber: 18 } },
    { matchNumber: 23, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'LOSER', matchNumber: 19 } },
    { matchNumber: 24, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'LOSER', matchNumber: 20 } },

    // WB R4
    { matchNumber: 25, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 17 }, teamB: { type: 'WINNER', matchNumber: 18 } },
    { matchNumber: 26, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 20 }, teamB: { type: 'WINNER', matchNumber: 19 } },

    // LB R5
    { matchNumber: 27, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 22 }, teamB: { type: 'WINNER', matchNumber: 21 } },
    { matchNumber: 28, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 24 }, teamB: { type: 'WINNER', matchNumber: 23 } },

    // LB R5
    { matchNumber: 29, bracket: 'LB', round: 6, teamA: { type: 'WINNER', matchNumber: 27 }, teamB: { type: 'LOSER', matchNumber: 26 } },
    { matchNumber: 30, bracket: 'LB', round: 6, teamA: { type: 'WINNER', matchNumber: 28 }, teamB: { type: 'LOSER', matchNumber: 25 } },

    // WB R5
    { matchNumber: 31, bracket: 'WB', round: 5, teamA: { type: 'WINNER', matchNumber: 26 }, teamB: { type: 'WINNER', matchNumber: 25 } },

    // LB R7
    { matchNumber: 32, bracket: 'LB', round: 7, teamA: { type: 'WINNER', matchNumber: 29 }, teamB: { type: 'WINNER', matchNumber: 30 } },

    // Disputa 3º lugar
    { matchNumber: 33, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 32 }, teamB: { type: 'LOSER', matchNumber: 31 } },

    // FINAL (última partida)
    { matchNumber: 34, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 32 }, teamB: { type: 'WINNER', matchNumber: 31 } },
];

