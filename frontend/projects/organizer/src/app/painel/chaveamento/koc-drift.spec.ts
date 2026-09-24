import type { KocPhaseSpec } from '../data/koc-phase-plan';
import { kocDriftDetail } from './koc-drift';

/** Espelha `kocDrift` de `chaveamento.component.ts`: aqui como função pura, sem
 *  precisar montar `ChaveamentoContextService` pra exercitar a comparação. */

const PHASE_A: KocPhaseSpec = { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 };
const PHASE_B: KocPhaseSpec = { bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 };

function round(overrides: Partial<Parameters<typeof kocDriftDetail>[0]> = {}) {
  return {
    phases: null as KocPhaseSpec[] | null,
    roundsPerBracket: 1,
    teamsPerCourt: 4,
    qualifiersPerRound: 2,
    ...overrides,
  };
}

function category(overrides: Partial<Parameters<typeof kocDriftDetail>[1]> = {}) {
  return {
    kocPhases: null as KocPhaseSpec[] | null,
    kocRoundsPerBracket: 1,
    kocTeamsPerCourt: 4,
    kocQualifiersPerRound: 2,
    ...overrides,
  };
}

describe('kocDriftDetail · plano com plano', () => {
  it('planos iguais não divergem', () => {
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A, PHASE_B] }),
      category({ kocPhases: [PHASE_A, PHASE_B] }),
    );
    expect(detail).toBeNull();
  });

  it('categoria com mais fases do que a chave publicada diverge', () => {
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A, PHASE_B] }),
      category({ kocPhases: [PHASE_A, PHASE_B, PHASE_B] }),
    );
    expect(detail).toBe('plano de fases: a categoria pede 3 fase(s), a chave foi gerada com 2.');
  });

  it('mudança só na fase 2 em diante também diverge — os três números não pegavam isso', () => {
    const editedPhaseB: KocPhaseSpec = { ...PHASE_B, roundsPerBracket: 2 };
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A, PHASE_B] }),
      category({ kocPhases: [PHASE_A, editedPhaseB] }),
    );
    expect(detail).not.toBeNull();
  });
});

describe('kocDriftDetail · chave antiga, sem plano', () => {
  it('sem divergência quando os três números batem', () => {
    expect(kocDriftDetail(round(), category())).toBeNull();
  });

  it('acumula uma mensagem por número que diverge', () => {
    const detail = kocDriftDetail(
      round({ roundsPerBracket: 1, teamsPerCourt: 4, qualifiersPerRound: 2 }),
      category({ kocRoundsPerBracket: 2, kocTeamsPerCourt: 5, kocQualifiersPerRound: 1 }),
    );
    expect(detail).toBe(
      'rodadas por chave: a categoria pede 2, a chave foi gerada com 1; ' +
        'duplas por quadra: a categoria pede 5, a chave foi gerada com 4; ' +
        'classificadas por rodada: a categoria pede 1, a chave foi gerada com 2.',
    );
  });

  it('categoria já tem plano configurado mas a chave publicada é de antes — sem plano pra comparar, fica pelos números', () => {
    const detail = kocDriftDetail(
      round({ phases: null, roundsPerBracket: 2, teamsPerCourt: 4, qualifiersPerRound: 2 }),
      category({ kocPhases: [PHASE_A], kocRoundsPerBracket: 1, kocTeamsPerCourt: 4, kocQualifiersPerRound: 2 }),
    );
    expect(detail).toBe('rodadas por chave: a categoria pede 1, a chave foi gerada com 2.');
  });

  it('chave publicada tem plano mas a categoria não guarda mais um — não dá pra comparar, e não compara pelos números também', () => {
    // Caso residual: não existe hoje um caminho de UI que zere `kocPhases` da
    // categoria depois de publicado com plano. Documentado aqui para não virar
    // regressão silenciosa se um dia existir.
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A], roundsPerBracket: 99, teamsPerCourt: 99, qualifiersPerRound: 99 }),
      category({ kocPhases: null }),
    );
    expect(detail).toBeNull();
  });
});
