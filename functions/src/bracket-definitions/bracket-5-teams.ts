import { MatchDefinition } from './bracket-definitions';

export const BRACKET_5_TEAMS: MatchDefinition[] = [
    // WB R1 (4 jogos no total, 2 são efetivamente byes que avançam o Seed)
    // O seeding padrão para 5 em 8 slots é: 1(B) vs 8(B), 5 vs 4, 3(B) vs 6(B), 7(B) vs 2(B).
    // Apenas 5 vs 4 é jogado. Os outros 3 são tratados como avanços automáticos.
    
    // Match 1: 5 vs 4 (Único jogo da WB R1)
    { matchNumber: 1, bracket: 'WB', round: 1, teamA: { type: 'SEED', seed: 5 }, teamB: { type: 'SEED', seed: 4 } },
    
    // WB R2 (2 jogos)
    // Seed 1 (que ganhou bye) vs Vencedor de M1
    { matchNumber: 2, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 3 }, teamB: { type: 'SEED', seed: 2 } },
    // Seed 3 (que ganhou bye) vs Seed 2 (que ganhou bye)
    { matchNumber: 3, bracket: 'WB', round: 2, teamA: { type: 'SEED', seed: 1 }, teamB: { type: 'WINNER', matchNumber: 1 } },
    
    
    // LB R1 - Pela lógica DE de 5 times, apenas o perdedor de M1 desce.
    // Ele "joga" contra um bye, avançando para LB R2. Vamos pular a LB R1 para simplificar.
    
    // LB R2 (Perdedor de M1 vs Perdedor de M2)
    { matchNumber: 4, bracket: 'LB', round: 2, teamA: { type: 'LOSER', matchNumber: 1 }, teamB: { type: 'LOSER', matchNumber: 2 } },
    
    // WB R3 (Final da WB)
    { matchNumber: 5, bracket: 'WB', round: 3, teamA: { type: 'WINNER', matchNumber: 2 }, teamB: { type: 'WINNER', matchNumber: 3 } },
    
    // LB R3 (Vencedor de M4 vs Perdedor de M3)
    { matchNumber: 6, bracket: 'LB', round: 3, teamA: { type: 'WINNER', matchNumber: 4 }, teamB: { type: 'LOSER', matchNumber: 3 } },

    // LB R4 (Final da LB)
    { matchNumber: 7, bracket: 'LB', round: 4, teamA: { type: 'WINNER', matchNumber: 6 }, teamB: { type: 'LOSER', matchNumber: 5 } },
    
    // Disputa 3º lugar
    { matchNumber: 8, bracket: 'THIRD_PLACE', round: 1, teamA: { type: 'LOSER', matchNumber: 6 }, teamB: { type: 'LOSER', matchNumber: 7 } },

    // FINAL (última partida)
    { matchNumber: 9, bracket: 'FINAL', round: 1, teamA: { type: 'WINNER', matchNumber: 5 }, teamB: { type: 'WINNER', matchNumber: 7 } },
];

