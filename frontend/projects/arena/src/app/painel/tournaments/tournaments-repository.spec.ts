import { countInscriptionsByTournament } from './tournaments-repository';

describe('countInscriptionsByTournament', () => {
  it('agrupa as inscrições por torneio', () => {
    const counts = countInscriptionsByTournament([
      { tournamentId: 't1' },
      { tournamentId: 't1' },
      { tournamentId: 't2' },
    ]);
    expect(counts.get('t1')).toBe(2);
    expect(counts.get('t2')).toBe(1);
  });

  it('deixa fora do mapa o torneio sem inscrição — quem chama usa 0', () => {
    expect(countInscriptionsByTournament([{ tournamentId: 't1' }]).has('t2')).toBe(false);
  });

  it('descarta inscrição sem `tournamentId` utilizável', () => {
    const counts = countInscriptionsByTournament([{ tournamentId: '  ' }, { tournamentId: 42 }, {}, { tournamentId: 't1' }]);
    expect(counts.size).toBe(1);
    expect(counts.get('t1')).toBe(1);
  });

  it('não conta nada sem inscrições', () => {
    expect(countInscriptionsByTournament([]).size).toBe(0);
  });
});
