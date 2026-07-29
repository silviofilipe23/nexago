import type { DocumentData, DocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import { groupPersistedSlotsByDayAndCourt } from '@nexago/arena-discovery';

function fakeDoc(id: string, data: Record<string, unknown>): DocumentSnapshot<DocumentData> {
  return { id, data: () => data } as unknown as DocumentSnapshot<DocumentData>;
}

function fakeSnapshot(docs: DocumentSnapshot<DocumentData>[]): QuerySnapshot {
  return { docs } as unknown as QuerySnapshot;
}

function slotData(over: Record<string, unknown>): Record<string, unknown> {
  return {
    arenaId: 'a1',
    courtId: 'c1',
    date: '2026-07-29',
    startTime: '18:00',
    endTime: '19:00',
    status: 'booked',
    ...over,
  };
}

describe('groupPersistedSlotsByDayAndCourt', () => {
  it('separa slots por dia e por quadra', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([
        fakeDoc('s1', slotData({})),
        fakeDoc('s2', slotData({ courtId: 'c2' })),
        fakeDoc('s3', slotData({ date: '2026-08-02' })),
      ]),
    );

    expect(index.get('2026-07-29|c1')?.length).toBe(1);
    expect(index.get('2026-07-29|c2')?.length).toBe(1);
    expect(index.get('2026-08-02|c1')?.length).toBe(1);
    expect(index.get('2026-08-02|c2')).toBeUndefined();
  });

  it('normaliza o courtId por caixa e espaços', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([fakeDoc('s1', slotData({ courtId: '  Quadra-A  ' }))]),
    );

    expect(index.get('2026-07-29|quadra-a')?.length).toBe(1);
  });

  it('ordena os slots do dia por horário de início', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([
        fakeDoc('s1', slotData({ startTime: '20:00', endTime: '21:00' })),
        fakeDoc('s2', slotData({ startTime: '08:00', endTime: '09:00' })),
        fakeDoc('s3', slotData({ startTime: '14:00', endTime: '15:00' })),
      ]),
    );

    expect(index.get('2026-07-29|c1')?.map((s) => s.startTime)).toEqual([
      '08:00',
      '14:00',
      '20:00',
    ]);
  });

  it('ignora documentos que não viram slot válido', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([fakeDoc('s1', { arenaId: 'a1' }), fakeDoc('s2', slotData({}))]),
    );

    expect(index.size).toBe(1);
    expect(index.get('2026-07-29|c1')?.length).toBe(1);
  });

  it('devolve mapa vazio para snapshot sem documentos', () => {
    expect(groupPersistedSlotsByDayAndCourt(fakeSnapshot([])).size).toBe(0);
  });
});
