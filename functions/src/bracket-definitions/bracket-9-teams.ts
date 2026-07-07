import { MatchDefinition } from './bracket-definitions';

export const BRACKET_9_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'SEED', seed: 2 } },

    // WB R2
    { matchNumber: 2, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 4 } },
    { matchNumber: 3, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 6 } },
    { matchNumber: 4, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    { matchNumber: 5, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 8 }, teamB: { type: 'SEED', seed: 9 } },

    // LB R1
    { matchNumber: 6, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 2 } },

    // LB R2
    { matchNumber: 7, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 5 }, teamB: { type: 'LOSER', matchNumber: 4 } },
    { matchNumber: 8, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'WINNER', matchNumber: 6 } },

    // WB R3
    { matchNumber: 9, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 2 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    { matchNumber: 10, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 4 }, teamB: { type: 'WINNER', matchNumber: 5 } },

    // LB R3
    { matchNumber: 11, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 7 }, teamB: { type: 'LOSER', matchNumber: 9 } },
    { matchNumber: 12, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 8 }, teamB: { type: 'LOSER', matchNumber: 10 } },

    // WB R4
    { matchNumber: 13, bracket: 'WB', round: 4, teamA: { type: 'WINNER', matchNumber: 10 }, teamB: { type: 'WINNER', matchNumber: 9 } },

    // LB R4
    { matchNumber: 14, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 12 }, teamB: { type: 'WINNER', matchNumber: 11 } },

    // Disputa 3º lugar
    { matchNumber: 15, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 14 }, teamB: { type: 'LOSER', matchNumber: 13 } },

    // FINAL
    { matchNumber: 16, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 14 }, teamB: { type: 'WINNER', matchNumber: 13 } },

    
];

