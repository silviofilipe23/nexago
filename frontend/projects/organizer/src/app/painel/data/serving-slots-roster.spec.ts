import {
  buildPointWrite,
  liveMatchFromDoc,
  medicalTimeoutFromRaw,
  medicalTimeoutPlayerKeysFromRaw,
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
});
