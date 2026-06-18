import { MatchDefinition } from './bracket-definitions';

export const BRACKET_10_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'SEED', seed: 2 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 4 } },

    // WB R2
    { matchNumber: 3, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 6 } },
    { matchNumber: 4, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 9 }, teamB: { type: 'SEED', seed: 10 } },
    { matchNumber: 5, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 1 }, teamB: { type: 'SEED', seed: 7 } },
    { matchNumber: 6, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 2 }, teamB: { type: 'SEED', seed: 8 } },

    // LB R1
    { matchNumber: 7, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 2 }, teamB: { type: 'LOSER', matchNumber: 3 } },
    { matchNumber: 8, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 4 } },

    // LB R2
    { matchNumber: 9, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 7 }, teamB: { type: 'LOSER', matchNumber: 5 } },
    { matchNumber: 10, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 8 }, teamB: { type: 'LOSER', matchNumber: 6 } },

    // WB R3
    { matchNumber: 11, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    { matchNumber: 12, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 4 }, teamB: { type: 'WINNER', matchNumber: 6 } },

    // LB R3
    { matchNumber: 13, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 9 }, teamB: { type: 'LOSER', matchNumber: 11 } },
    { matchNumber: 14, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 10 }, teamB: { type: 'LOSER', matchNumber: 12 } },

    // WB R4
    { matchNumber: 15, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 12 }, teamB: { type: 'WINNER', matchNumber: 11 } },

    // LB R4
    { matchNumber: 16, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'WINNER', matchNumber: 13 } },

    // Disputa 3º lugar
    { matchNumber: 17, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 16 }, teamB: { type: 'LOSER', matchNumber: 15 } },

    // FINAL
    { matchNumber: 18, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 16 }, teamB: { type: 'WINNER', matchNumber: 15 } },

    
];

