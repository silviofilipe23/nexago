import { FUNDAMENTALS, averageScore, latestTwoByAthlete, type Evaluation, type EvaluationScores } from './evaluation-stats';

function scores(overrides: Partial<EvaluationScores> = {}): EvaluationScores {
  return {
    saque: 5, recepcao: 5, levantamento: 5, ataque: 5, defesa: 5,
    bloqueio: 5, condicionamento: 5, comunicacao: 5, mental: 5,
    ...overrides,
  };
}

describe('averageScore', () => {
  it('averages all 9 fundamentals', () => {
    expect(averageScore(scores())).toBe(5);
  });

  it('reflects a mix of high and low scores', () => {
    expect(averageScore(scores({ saque: 10, recepcao: 0 }))).toBeCloseTo(5, 5);
  });
});

describe('latestTwoByAthlete', () => {
  const evals: Evaluation[] = [
    { id: 'e1', athleteUid: 'a1', date: '2026-06-01', scores: scores({ saque: 4 }), notes: '' },
    { id: 'e2', athleteUid: 'a1', date: '2026-07-01', scores: scores({ saque: 7 }), notes: '' },
    { id: 'e3', athleteUid: 'a2', date: '2026-07-05', scores: scores(), notes: '' },
  ];

  it('picks the most recent evaluation as latest, by date string', () => {
    const map = latestTwoByAthlete(evals);
    expect(map.get('a1')?.latest.id).toBe('e2');
    expect(map.get('a1')?.previous?.id).toBe('e1');
  });

  it('leaves previous null when there is only one evaluation', () => {
    const map = latestTwoByAthlete(evals);
    expect(map.get('a2')?.latest.id).toBe('e3');
    expect(map.get('a2')?.previous).toBeNull();
  });
});

describe('FUNDAMENTALS', () => {
  it('lists all 9 evaluation keys in the fixed prototype order', () => {
    expect(FUNDAMENTALS.map((f) => f.key)).toEqual([
      'saque', 'recepcao', 'levantamento', 'ataque', 'defesa',
      'bloqueio', 'condicionamento', 'comunicacao', 'mental',
    ]);
  });

  it('gives every fundamental a non-empty display label', () => {
    expect(FUNDAMENTALS.every((f) => f.label.trim().length > 0)).toBe(true);
  });
});
