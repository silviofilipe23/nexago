import { rawMatchFromDoc } from './matches-repository';

describe('rawMatchFromDoc · vaga desatualizada (qualifierDrift)', () => {
  it('lê quem a classificação atual poria em cada lado', () => {
    const r = rawMatchFromDoc('m1', { tournamentId: 't1', qualifierDrift: { teamAId: ' duda ' } });
    expect(r.seedingDrift).toEqual({ teamAId: 'duda', teamBId: null });
  });

  it('partida sem o campo, ou com ele vazio, não tem aviso', () => {
    expect(rawMatchFromDoc('m1', { tournamentId: 't1' }).seedingDrift).toBeNull();
    expect(rawMatchFromDoc('m1', { tournamentId: 't1', qualifierDrift: {} }).seedingDrift).toBeNull();
    expect(rawMatchFromDoc('m1', { tournamentId: 't1', qualifierDrift: 'x' }).seedingDrift).toBeNull();
  });
});
