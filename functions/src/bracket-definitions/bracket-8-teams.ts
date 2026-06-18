import { MatchDefinition } from './bracket-definitions';

export const BRACKET_8_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'SEED', seed: 2 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 4 } },
    { matchNumber: 3, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 6 } },
    { matchNumber: 4, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 7 }, teamB: { type: 'SEED', seed: 8 } },

    // LB R1
    { matchNumber: 5, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 2 } },
    { matchNumber: 6, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 4 } },

    // WB R2
    { matchNumber: 7, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 1 }, teamB: { type: 'WINNER', matchNumber: 2 } },
    { matchNumber: 8, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 3 }, teamB: { type: 'WINNER', matchNumber: 4 } },

    // LB R2
    { matchNumber: 9, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'LOSER', matchNumber: 8 } },
    { matchNumber: 10, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 6 }, teamB: { type: 'LOSER', matchNumber: 7 } },

    // WB R3
    { matchNumber: 11, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 7 }, teamB: { type: 'WINNER', matchNumber: 8 } },

    // LB R3
    { matchNumber: 12, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 9 }, teamB: { type: 'WINNER', matchNumber: 10 } },

    // Disputa 3º lugar
    { matchNumber: 13, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 12 }, teamB: { type: 'LOSER', matchNumber: 11 } },

    // FINAL (última partida)
    { matchNumber: 14, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 12 }, teamB: { type: 'WINNER', matchNumber: 11 } },
];

