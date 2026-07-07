import { MatchDefinition } from './bracket-definitions';

export const BRACKET_14_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'SEED', seed: 2 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 4 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 6 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 8 } },
    { matchNumber: 5, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 9 }, teamB: { type: 'SEED', seed: 10 } },
    { matchNumber: 6, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 11 }, teamB: { type: 'SEED', seed: 12 } },

    // WB R2
    { matchNumber: 7, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 13 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    { matchNumber: 8, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 2 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    { matchNumber: 9, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 4 }, teamB: { type: 'WINNER', matchNumber: 5 } },
    { matchNumber: 10, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 14 }, teamB: { type: 'WINNER', matchNumber: 6 } },

    // LB R1
    { matchNumber: 11, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 2 } },
    { matchNumber: 12, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 4 }, teamB: { type: 'LOSER', matchNumber: 5 } },

    // LB R2
    { matchNumber: 13, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 6 }, teamB: { type: 'LOSER', matchNumber: 8 } },
    { matchNumber: 14, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 9 } },
    { matchNumber: 15, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 7 }, teamB: { type: 'WINNER', matchNumber: 11 } },
    { matchNumber: 16, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 12 }, teamB: { type: 'LOSER', matchNumber: 10 } },

    // WB R3
    { matchNumber: 17, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 7 }, teamB: { type: 'WINNER', matchNumber: 8 } },
    { matchNumber: 18, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 9 }, teamB: { type: 'WINNER', matchNumber: 10 } },

    // LB R3
    { matchNumber: 19, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 13 }, teamB: { type: 'WINNER', matchNumber: 15 } },
    { matchNumber: 20, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'WINNER', matchNumber: 14 } },

    // LB R4
    { matchNumber: 21, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 19 }, teamB: { type: 'LOSER', matchNumber: 18 } },
    { matchNumber: 22, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 20 }, teamB: { type: 'LOSER', matchNumber: 17 } },

    // WB R4
    { matchNumber: 23, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 18 }, teamB: { type: 'WINNER', matchNumber: 17 } },

    // LB R5
    { matchNumber: 24, bracket: 'LB', round: 5, teamA: { type: 'WINNER', matchNumber: 22 }, teamB: { type: 'WINNER', matchNumber: 21 } },

    // Disputa 3º lugar
    { matchNumber: 25, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 24 }, teamB: { type: 'LOSER', matchNumber: 23 } },

    // FINAL (última partida)
    { matchNumber: 26, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 24 }, teamB: { type: 'WINNER', matchNumber: 23 } },
];

