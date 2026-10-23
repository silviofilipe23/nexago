import { readSession, readTrials } from './mappers';

describe('readTrials (experimentais na aula)', () => {
  it('lê o espelho do servidor, por nome; status desconhecido vira pendente', () => {
    const out = readTrials({
      uB: { bookingId: 'k_uB', name: 'Bruno', photoUrl: 'https://x/b.jpg', status: 'confirmed' },
      uA: { name: 'Ana', status: 'weird' },
      lixo: 'x',
    });
    expect(out).toEqual([
      { athleteId: 'uA', bookingId: '', name: 'Ana', photoUrl: null, status: 'pending' },
      { athleteId: 'uB', bookingId: 'k_uB', name: 'Bruno', photoUrl: 'https://x/b.jpg', status: 'confirmed' },
    ]);
  });

  it('aula sem o campo: lista vazia', () => {
    expect(readTrials(null)).toEqual([]);
    expect(readSession('k1_2026-10-22', { classId: 'k1', date: '2026-10-22' }).trials).toEqual([]);
  });
});
