import { filterAthleteCandidates, type AthleteCandidate } from './athlete-search-filter';

const CANDIDATES: AthleteCandidate[] = [
  { athleteId: 'a1', name: 'João Silva' },
  { athleteId: 'a2', name: 'Maria José' },
  { athleteId: 'a3', name: 'Ana Souza' },
  { athleteId: 'a4', name: 'João Pedro' },
];

describe('filterAthleteCandidates', () => {
  it('menos de 2 caracteres não filtra nada (lista vazia)', () => {
    expect(filterAthleteCandidates(CANDIDATES, 'j')).toEqual([]);
  });

  it('filtra por substring, ignorando acento e caixa', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'joao');
    expect(result.map((c) => c.athleteId)).toEqual(['a1', 'a4']);
  });

  it('acha por sobrenome também', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'souza');
    expect(result.map((c) => c.athleteId)).toEqual(['a3']);
  });

  it('sem match retorna lista vazia', () => {
    expect(filterAthleteCandidates(CANDIDATES, 'xyz')).toEqual([]);
  });

  it('limita a 8 resultados', () => {
    const many: AthleteCandidate[] = Array.from({ length: 12 }, (_, i) => ({ athleteId: `id${i}`, name: `Carlos ${i}` }));
    expect(filterAthleteCandidates(many, 'carlos').length).toBe(8);
  });
});
