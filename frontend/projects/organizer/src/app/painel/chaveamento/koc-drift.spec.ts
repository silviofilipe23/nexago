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

  it('chave com plano e categoria sem — o caso do app e do Sorteio ao Vivo — fica quieto', () => {
    // `kocPhases` na categoria só existe quando a chave foi gerada PELO PORTAL
    // (`saveKocPhasePlan`). O app e o publish do sorteio congelam o plano na
    // rodada sem gravá-lo na categoria, e o sorteio acontece ANTES da chave
    // existir — ou seja, este é o caminho comum, não a anomalia. Avisar aqui
    // acendia o banner para sempre numa chave que bate perfeitamente.
    const detail = kocDriftDetail(
      round({ phases: [PHASE_A], roundsPerBracket: 99, teamsPerCourt: 99, qualifiersPerRound: 99 }),
      category({ kocPhases: null }),
    );
    expect(detail).toBeNull();
  });

  it('e não troca o falso positivo por outro: os três números da rodada são os da FASE', () => {
    // 6 duplas em quadras de 4 fecham em duas chaves de 3: a rodada congela
    // `teamsPerCourt: 3` sem ninguém ter mexido na categoria. Comparar esses
    // números com os da categoria acenderia o banner em campo nenhum.
    const fase1: KocPhaseSpec = { bracketSizes: [3, 3], roundsPerBracket: 1, qualifiersPerRound: 1, durationSec: 900 };
    const detail = kocDriftDetail(
      round({ phases: [fase1, PHASE_B], roundsPerBracket: 1, teamsPerCourt: 3, qualifiersPerRound: 1 }),
      category({ kocPhases: null, kocRoundsPerBracket: 1, kocTeamsPerCourt: 4, kocQualifiersPerRound: 2 }),
    );
    expect(detail).toBeNull();
  });
});
