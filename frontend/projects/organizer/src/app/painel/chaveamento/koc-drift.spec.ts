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

  it('mudança só na fase 2 em diante diverge, nomeando a fase e o campo — não só "2 contra 2"', () => {
    // Mesmo número de fases dos dois lados: a mensagem de contagem
    // ("a categoria pede 2, a chave foi gerada com 2") mostraria o mesmo
    // número nos dois lados e não diria nada. É essa mensagem vazia que o
    // teto de baixo pina — a fase que muda e o que mudou nela.
    const editedPhaseB: KocPhaseSpec = { ...PHASE_B, roundsPerBracket: 2 };
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A, PHASE_B] }),
      category({ kocPhases: [PHASE_A, editedPhaseB] }),
    );
    expect(detail).toBe('Final (fase 2) — baterias: a categoria pede 2, a chave foi gerada com 1.');
  });

  it('nomeia a Classificatória (primeira de três) quando a divergência é nas chaves', () => {
    const editedPhaseA: KocPhaseSpec = { ...PHASE_A, bracketSizes: [6, 4] };
    const final: KocPhaseSpec = { bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 };
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A, PHASE_B, final] }),
      category({ kocPhases: [editedPhaseA, PHASE_B, final] }),
    );
    expect(detail).toBe(
      'Classificatória (fase 1) — chaves: a categoria pede 6, 4, a chave foi gerada com 5, 5.',
    );
  });

  it('nomeia a Semifinal (do meio, com 3 fases) quando a divergência é nas classificadas', () => {
    const editedPhaseB: KocPhaseSpec = { ...PHASE_B, qualifiersPerRound: 2 };
    const final: KocPhaseSpec = { bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 };
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A, PHASE_B, final] }),
      category({ kocPhases: [PHASE_A, editedPhaseB, final] }),
    );
    expect(detail).toBe(
      'Semifinal (fase 2) — classificadas: a categoria pede 2, a chave foi gerada com 0.',
    );
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

  it('chave publicada tem plano mas a categoria não guarda mais um — avisa em vez de ficar quieto', () => {
    // Não existe hoje um caminho de UI que zere `kocPhases` da categoria
    // depois de publicado com plano — mas silêncio aqui seria o pior caso: os
    // dois lados podem ter divergido de qualquer jeito, e "sem aviso" lê como
    // "está tudo igual". Fica pelos três números também não daria: eles não
    // descrevem o plano que a categoria já não guarda mais.
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A], roundsPerBracket: 99, teamsPerCourt: 99, qualifiersPerRound: 99 }),
      category({ kocPhases: null }),
    );
    expect(detail).toBe('plano de fases: a categoria não guarda mais um plano — a chave foi gerada com um.');
  });
});
