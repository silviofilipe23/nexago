import {
  buildMedicalTimeoutStartWrite,
  buildPointWrite,
  buildUndoWrite,
  servingTeamFields,
  liveMatchFromDoc,
  medicalTimeoutFromRaw,
  medicalTimeoutPlayerKeysFromRaw,
  rosterSizeFromMemberUids,
  needsServingPlayer,
  servingPlayerSlotOf,
  servingPlayerSlotsAfterScore,
  swappedServingPlayerSlots,
  withRosterSizes,
} from '@nexago/live-scoring';

/** Saque e tempo médico por tamanho do elenco (multiesporte fase 4b2): individual (1), dupla (2),
 *  equipe (3–5). */
describe('slots de saque e tempo médico por elenco', () => {
  const ids = { teamAId: 'tA', teamBId: 'tB' };

  it('saque volta para o lado: individual mantém o 1; dupla alterna; trio roda', () => {
    const base = { previousServingTeamId: 'tB', nextServingTeamId: 'tA', ...ids };
    expect(servingPlayerSlotsAfterScore({ ...base, slots: { A: 1, B: 1 }, rosterSizes: { A: 1, B: 1 } })).toEqual({ A: 1, B: 1 });
    expect(servingPlayerSlotsAfterScore({ ...base, slots: { A: 1, B: 1 } })).toEqual({ A: 2, B: 1 });
    expect(servingPlayerSlotsAfterScore({ ...base, slots: { A: 3, B: 1 }, rosterSizes: { A: 3, B: 2 } })).toEqual({ A: 1, B: 1 });
  });

  it('individual: o atleta no saque é sempre o 1, e a mesa não pergunta quem saca', () => {
    expect(servingPlayerSlotOf({ slots: { A: 0, B: 0 }, servingTeamId: 'tA', ...ids, rosterSizes: { A: 1, B: 2 } })).toBe(1);
    expect(needsServingPlayer({ servingTeamId: 'tA', servingPlayerSlot: 0, status: 'in_progress', ...ids, servingRosterSize: 1 })).toBeFalse();
    expect(needsServingPlayer({ servingTeamId: 'tA', servingPlayerSlot: 0, status: 'in_progress', ...ids })).toBeTrue();
    expect(swappedServingPlayerSlots({ slots: { A: 1, B: 1 }, servingTeamId: 'tA', ...ids, rosterSizes: { A: 1, B: 1 } })).toEqual({ A: 1, B: 1 });
  });

  it('ponto gravado numa individual não aponta para o "atleta 2" inexistente', () => {
    const m = withRosterSizes(liveMatchFromDoc('m1', {
      tournamentId: 'T', teamAId: 'tA', teamBId: 'tB', status: 'In Progress',
      sets: [{ teamAScore: 3, teamBScore: 3 }], currentSetIndex: 0, bestOf: 3,
      servingTeamId: 'tB', servingPlayerSlots: { A: 1, B: 1 }, servingPlayerSlot: 1,
    }), { A: 1, B: 1 });
    const write = buildPointWrite(m, 'A')!;
    expect(write.matchUpdate['servingPlayerSlots']).toEqual({ A: 1, B: 1 });
    expect(write.matchUpdate['servingPlayerSlot']).toBe(1);
  });

  it('tempo médico aceita posições 1–5 (equipe) e recusa fora disso', () => {
    expect(medicalTimeoutPlayerKeysFromRaw(['A1', 'B3', 'A5', 'B6', 'C1'])).toEqual(['A1', 'B3', 'A5']);
    expect(medicalTimeoutFromRaw({ side: 'B', playerSlot: 4, teamId: 'tB' })?.playerSlot).toBe(4);
    expect(medicalTimeoutFromRaw({ side: 'B', playerSlot: 6, teamId: 'tB' })).toBeNull();
  });

  it('tempo médico do 3º atleta de uma equipe grava (não só 1 e 2)', () => {
    const m = withRosterSizes(liveMatchFromDoc('m1', {
      tournamentId: 'T', teamAId: 'tA', teamBId: 'tB', status: 'In Progress',
      sets: [{ teamAScore: 3, teamBScore: 3 }], currentSetIndex: 0, bestOf: 3,
    }), { A: 4, B: 4 });
    const write = buildMedicalTimeoutStartWrite(m, { side: 'A', playerSlot: 3, playerName: 'Ana' });
    expect(write).not.toBeNull();
    expect(write!.matchUpdate['medicalTimeoutPlayers']).toEqual(['A3']);
  });

  it('individual: a escrita grava o titular na ordem do lado (doc coerente para as outras mesas)', () => {
    const m = withRosterSizes(liveMatchFromDoc('m1', {
      tournamentId: 'T', teamAId: 'tA', teamBId: 'tB', status: 'In Progress',
      sets: [{ teamAScore: 0, teamBScore: 0 }], currentSetIndex: 0, bestOf: 3,
    }), { A: 1, B: 1 });
    expect(servingTeamFields(m, 'tA')).toEqual(jasmine.objectContaining({ servingPlayerSlots: { A: 1, B: 1 }, servingPlayerSlot: 1 }));
  });

  it('elenco pelo memberUids gravado: 1 só na individual; dupla legada/incompleta segue 2', () => {
    expect(rosterSizeFromMemberUids(['a'])).toBe(1);
    expect(rosterSizeFromMemberUids(['a', 'b', 'c'])).toBe(3);
    // Dupla legada sem memberUids e dupla "procurando parceiro" (mesmo uid duas vezes).
    expect(rosterSizeFromMemberUids([])).toBe(2);
    expect(rosterSizeFromMemberUids(undefined)).toBe(2);
    expect(rosterSizeFromMemberUids(['a', 'a'])).toBe(2);
  });

  it('posição 3–5 gravada no doc volta da leitura (escalar e desfazer de games), não vira "não declarada"', () => {
    const m = liveMatchFromDoc('m1', {
      tournamentId: 'T', teamAId: 'tA', teamBId: 'tB', status: 'In Progress',
      sets: [{ teamAScore: 3, teamBScore: 3 }], currentSetIndex: 0, bestOf: 3,
      servingTeamId: 'tA', servingPlayerSlots: { A: 3, B: 1 }, servingPlayerSlot: 3,
    });
    expect(m.servingPlayerSlot).toBe(3);
    expect(liveMatchFromDoc('m2', { servingPlayerSlot: 6 }).servingPlayerSlot).toBe(0);
    expect(needsServingPlayer({ servingTeamId: 'tA', servingPlayerSlot: m.servingPlayerSlot, status: 'in_progress', ...ids, servingRosterSize: 3 })).toBeFalse();
  });

  it('desfazer de games repõe a posição 3 gravada no evento', () => {
    const m = liveMatchFromDoc('m1', {
      tournamentId: 'T', teamAId: 'tA', teamBId: 'tB', status: 'In Progress',
      sets: [{ teamAScore: 1, teamBScore: 0 }], currentSetIndex: 0, bestOf: 3,
      currentGame: { a: 1, b: 0 },
      scoringProfile: { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 },
    });
    const prev = { sets: [{ teamAScore: 1, teamBScore: 0 }], currentSetIndex: 0, currentGame: { a: 0, b: 0 }, servingTeamId: 'tA', servingPlayerSlots: { A: 3, B: 1 }, servingPlayerSlot: 3 };
    const write = buildUndoWrite(m, 'A', 0, prev);
    expect(write?.matchUpdate['servingPlayerSlot']).toBe(3);
  });
});
