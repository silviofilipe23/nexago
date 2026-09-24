import type { KocPhaseSpec } from './koc-phase-plan';
import { kocCategoriesWithPlan } from './tournaments-repository';

/**
 * `kocCategoriesWithPlan` é a cirurgia pura por trás de `saveKocPhasePlan`
 * (transação no Firestore): recebe o array `categories` inteiro do doc do
 * torneio e devolve um novo array com o plano aplicado só na categoria alvo.
 *
 * Testada separada da transação porque os specs deste portal são unitários
 * (Karma, sem Firestore) — um teste de `saveKocPhasePlan` em si precisaria de
 * mocks e não alcançaria a cirurgia de verdade.
 */
describe('kocCategoriesWithPlan · cirurgia no array categories', () => {
  const PLAN: KocPhaseSpec[] = [
    { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 },
    { bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 },
  ];

  it('grava kocPhases e kocMaxTeamsPerRound só na categoria alvo', () => {
    const categories = [
      { id: 'cat-a', name: 'Categoria A' },
      { id: 'cat-b', name: 'Categoria B' },
    ];
    const result = kocCategoriesWithPlan(categories, 'cat-b', PLAN, 6);
    expect(result[1]).toEqual({ id: 'cat-b', name: 'Categoria B', kocPhases: PLAN, kocMaxTeamsPerRound: 6 });
  });

  it('categoria fora do alvo volta byte-idêntica — a proteção contra clobber', () => {
    // Dois membros da equipe editando categorias diferentes ao mesmo tempo é rotina neste
    // produto. Se a cirurgia tocasse os elementos que não são o alvo, o write de um apagaria
    // (ou recriaria com menos campos) a categoria que o outro acabou de gravar.
    const other = { id: 'cat-a', name: 'Categoria A', entryFee: 50, bestOf: 'bestOf3' };
    const categories = [other, { id: 'cat-b', name: 'Categoria B' }];
    const result = kocCategoriesWithPlan(categories, 'cat-b', PLAN, 6);
    expect(result[0]).toBe(other);
  });

  it('categoryId desconhecido deixa o array intocado', () => {
    const categories = [{ id: 'cat-a' }, { id: 'cat-b' }];
    const result = kocCategoriesWithPlan(categories, 'cat-z', PLAN, 6);
    expect(result).toEqual(categories);
    expect(result[0]).toBe(categories[0]);
    expect(result[1]).toBe(categories[1]);
  });

  it('entrada que não é objeto não derruba a cirurgia', () => {
    const categories: unknown[] = [null, 'lixo', 42, { id: 'cat-b' }];
    expect(() => kocCategoriesWithPlan(categories, 'cat-b', PLAN, 6)).not.toThrow();
    const result = kocCategoriesWithPlan(categories, 'cat-b', PLAN, 6);
    expect(result[0]).toBeNull();
    expect(result[1]).toBe('lixo');
    expect(result[2]).toBe(42);
    expect(result[3]).toEqual({ id: 'cat-b', kocPhases: PLAN, kocMaxTeamsPerRound: 6 });
  });

  it('bracketSizes é copiado, não compartilhado por referência com o plano do chamador', () => {
    const categories = [{ id: 'cat-b' }];
    const result = kocCategoriesWithPlan(categories, 'cat-b', PLAN, 6) as Array<Record<string, unknown>>;
    const savedPhases = result[0]!['kocPhases'] as KocPhaseSpec[];
    expect(savedPhases[0]!.bracketSizes).toEqual(PLAN[0]!.bracketSizes);
    expect(savedPhases[0]!.bracketSizes).not.toBe(PLAN[0]!.bracketSizes);
  });
});
