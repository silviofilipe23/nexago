import { filterAthleteCandidates, type AthleteCandidate } from './athlete-search-filter';

const CANDIDATES: AthleteCandidate[] = [
  { athleteId: 'a1', name: 'João Silva' },
  { athleteId: 'a2', name: 'Maria José' },
  { athleteId: 'a3', name: 'Ana Souza' },
  { athleteId: 'a4', name: 'João Pedro' },
];

describe('filterAthleteCandidates', () => {
  it('sem texto lista todos os atletas em ordem alfabética', () => {
    const result = filterAthleteCandidates(CANDIDATES, '');
    expect(result.map((c) => c.athleteId)).toEqual(['a3', 'a4', 'a1', 'a2']);
  });

  it('sem texto limita a 50 atletas', () => {
    const many: AthleteCandidate[] = Array.from({ length: 60 }, (_, i) => ({ athleteId: `id${i}`, name: `Atleta ${i}` }));
    expect(filterAthleteCandidates(many, '  ').length).toBe(50);
  });

  it('1 caractere já filtra', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'j');
    expect(result.map((c) => c.athleteId)).toEqual(['a4', 'a1', 'a2']);
  });

  it('filtra por substring, ignorando acento e caixa', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'joao');
    expect(result.map((c) => c.athleteId)).toEqual(['a4', 'a1']);
  });

  it('acha por sobrenome também', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'souza');
    expect(result.map((c) => c.athleteId)).toEqual(['a3']);
  });

  it('sem match retorna lista vazia', () => {
    expect(filterAthleteCandidates(CANDIDATES, 'xyz')).toEqual([]);
  });

  it('com texto limita a 8 resultados', () => {
    const many: AthleteCandidate[] = Array.from({ length: 12 }, (_, i) => ({ athleteId: `id${i}`, name: `Carlos ${i}` }));
    expect(filterAthleteCandidates(many, 'carlos').length).toBe(8);
  });
});
