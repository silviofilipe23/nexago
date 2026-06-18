import { MatchDefinition } from './bracket-definitions';

export const BRACKET_6_TEAMS: MatchDefinition[] = [
    // WB R1
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'SEED', seed: 2 } },
    { matchNumber: 2, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 4 } },

    // WB R2
    { matchNumber: 3, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    { matchNumber: 4, bracket: 'WB', round: 2, teamA: { type: 'WINNER', matchNumber: 2 }, teamB: { type: 'SEED', seed: 6 } },
    
    // LB R1 (perdedores da WB R1 e WB R2)
    { matchNumber: 5, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 2 } },
    { matchNumber: 6, bracket: 'LB', round: 1, teamA: { type: 'LOSER', matchNumber: 3 }, teamB: { type: 'LOSER', matchNumber: 4 } },

    // WB R3 (final da WB)
    { matchNumber: 7, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 3 }, teamB: { type: 'WINNER', matchNumber: 4 } },

    // LB R2
    { matchNumber: 8, bracket: 'LB', round: 2, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'WINNER', matchNumber: 6 } },
    
    // LB R3
    { matchNumber: 9, bracket: 'LB', round: 3, teamA: { type: 'LOSER', matchNumber: 7 }, teamB: { type: 'WINNER', matchNumber: 8 } },

    // Disputa 3º lugar
    { matchNumber: 10, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 9 }, teamB: { type: 'LOSER', matchNumber: 8 } },

    // FINAL (última partida)
    { matchNumber: 11, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 9 }, teamB: { type: 'WINNER', matchNumber: 7 } },
];

