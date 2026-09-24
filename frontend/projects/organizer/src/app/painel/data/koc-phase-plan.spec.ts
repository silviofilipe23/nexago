import {
  kocApplyPhaseEdit,
  kocBracketCountOptions,
  kocPhaseFieldSizes,
  kocPlansMatch,
  kocPlanTotals,
  kocProposePhasePlan,
  parseKocPhases,
} from './koc-phase-plan';

/** Espelho do `kocProposePlan` do servidor: a tabela mostra o plano que a
 *  geração vai executar, então divergir aqui é mentir na tela. */
describe('plano de fases · proposta', () => {
  it('10 duplas com teto 6 é o formato pedido pelo dono', () => {
    expect(kocProposePhasePlan(10, 6, 900)).toEqual([
      {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ]);
  });

  it('campo que cabe numa quadra é uma rodada só', () => {
    expect(kocProposePhasePlan(6, 6, 900)).toEqual([
      {bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ]);
  });

  it('o campo de cada fase é o que a anterior classifica', () => {
    expect(kocPhaseFieldSizes(kocProposePhasePlan(10, 6, 900))).toEqual([10, 6, 4]);
  });
});

/**
 * Congelados rodando o `kocProposePlan` de verdade em
 * `functions/src/koc-bracket-builders.ts`, commit 75c272e1 — o proposer é
 * "orçamento-consciente" (leva em conta `KOC_MAX_PHASES` olhando para frente,
 * não só guloso fase a fase). Formato de cada fase:
 * `[bracketSizes, roundsPerBracket, qualifiersPerRound]`, todas com
 * `durationSec: 900`.
 *
 * Se o espelho divergir de qualquer uma destas, o ESPELHO está errado — não
 * ajuste a fixture. n=6 é final de bateria única; n=7 exercita o ramo
 * "rounds === 1 → sobe qualifiers"; n=14/20/25 exercitam o orçamento de fases
 * (`left`) perto do teto de `KOC_MAX_PHASES`.
 */
describe('plano de fases · paridade com o servidor', () => {
  const FIXTURES: Array<[number, number, Array<[number[], number, number]>]> = [
    [10, 6, [[[5, 5], 3, 1], [[6], 4, 1], [[4], 1, 0]]],
    [6, 6, [[[6], 1, 0]]],
    [7, 6, [[[4, 3], 1, 2], [[4], 1, 0]]],
    [14, 6, [[[5, 5, 4], 2, 1], [[6], 4, 1], [[4], 1, 0]]],
    [20, 6, [[[5, 5, 5, 5], 3, 1], [[6, 6], 4, 1], [[4, 4], 2, 1], [[4], 1, 0]]],
    [9, 5, [[[5, 4], 2, 1], [[4], 1, 0]]],
    [12, 4, [[[4, 4, 4], 2, 1], [[3, 3], 1, 2], [[4], 1, 0]]],
    [25, 6, [[[5, 5, 5, 5, 5], 3, 1], [[5, 5, 5], 3, 1], [[5, 4], 2, 1], [[4], 1, 0]]],
  ];

  for (const [teamCount, maxPerRound, phases] of FIXTURES) {
    it(`n=${teamCount} teto=${maxPerRound}`, () => {
      const expected = phases.map(([bracketSizes, roundsPerBracket, qualifiersPerRound]) => ({
        bracketSizes,
        roundsPerBracket,
        qualifiersPerRound,
        durationSec: 900,
      }));
      expect(kocProposePhasePlan(teamCount, maxPerRound, 900)).toEqual(expected);
    });
  }
});

describe('plano de fases · contagens de chave que o sorteio reproduz', () => {
  it('só oferece contagens que sobrevivem à ida e volta pelo tamanho', () => {
    // 25 duplas em 6 chaves voltam como 5 pelo alvo 5 — 6 não pode ser oferecido.
    expect(kocBracketCountOptions(25, 6)).not.toContain(6);
    expect(kocBracketCountOptions(25, 6)).toContain(5);
  });

  it('10 duplas com teto 6 aceitam 2 ou 3 chaves', () => {
    expect(kocBracketCountOptions(10, 6)).toEqual([2, 3]);
  });

  it('nenhuma opção fura o piso nem o teto', () => {
    for (let n = 3; n <= 30; n++) {
      for (const count of kocBracketCountOptions(n, 6)) {
        const target = Math.ceil(n / count);
        expect(target).toBeLessThanOrEqual(6);
        expect(Math.floor(n / count)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('plano de fases · edição em cascata', () => {
  it('mexer numa fase repropõe as de baixo', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    // Baixar a semi de 4 para 2 baterias manda 2 duplas para a fase seguinte —
    // abaixo do piso, então a semi VIRA a final e o plano encurta.
    const edited = kocApplyPhaseEdit(plan, 1, {roundsPerBracket: 2}, 6);
    expect(edited.length).toBe(2);
    expect(edited[0]).toEqual(plan[0]);
    expect(edited[1].bracketSizes).toEqual([6]);
    expect(edited[1].roundsPerBracket).toBe(1);
    expect(edited[1].qualifiersPerRound).toBe(0);
  });

  it('mexer na fase 1 não muda a fase 1 e reescreve o resto', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {roundsPerBracket: 1, qualifiersPerRound: 2}, 6);
    expect(edited[0].bracketSizes).toEqual([5, 5]);
    expect(edited[0].roundsPerBracket).toBe(1);
    expect(edited[0].qualifiersPerRound).toBe(2);
    // 2 chaves × 1 bateria × 2 classificadas = 4 → final de 4.
    expect(kocPhaseFieldSizes(edited)).toEqual([10, 4]);
  });

  it('trocar a contagem de chaves redistribui os tamanhos', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {bracketCount: 3}, 6);
    expect(edited[0].bracketSizes).toEqual([4, 3, 3]);
  });

  it('a duração editada não é reproposta junto', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {durationSec: 1200}, 6);
    expect(edited[0].durationSec).toBe(1200);
  });

  it('cascata que não fecha em nenhuma chave válida devolve plano vazio', () => {
    // 15 duplas com teto 4 propõem [[4,4,4,3],1,2] → [[4,4],2,1] → [[4],1,0].
    // Pedir 5 chaves na fase 1 é uma edição LEGÍTIMA nela mesma — [3,3,3,3,3]
    // respeita piso e teto — mas manda só 5 duplas (5 chaves × 1 bateria × 1
    // classificada) para a fase seguinte, e 5 não cabe em NENHUMA chave entre
    // o piso 3 e o teto 4 (1 chave estoura o teto, 2 chaves furam o piso numa
    // delas). A fase editada em si é válida; é o RABO que não fecha. Mesma
    // convenção do proposer: sem plano válido, devolve `[]` em vez de uma
    // fase editada sem continuação.
    const plan = kocProposePhasePlan(15, 4, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {bracketCount: 5, roundsPerBracket: 1, qualifiersPerRound: 1}, 4);
    expect(edited).toEqual([]);
  });
});

describe('plano de fases · limites da própria fase editada', () => {
  it('bracketCount alto demais fura o piso da fase editada', () => {
    // 10 duplas em 5 chaves dariam [2,2,2,2,2] — toda chave abaixo do piso 3.
    // A geração recusaria rio abaixo (`koc_battery_too_small`), mas a função
    // não deveria fabricar em silêncio uma fase que a própria edição já sabe
    // ser ilegal.
    const plan = kocProposePhasePlan(10, 6, 900);
    expect(kocApplyPhaseEdit(plan, 0, {bracketCount: 5}, 6)).toEqual([]);
  });

  it('bracketCount baixo demais fura o teto da fase editada', () => {
    // 20 duplas numa chave só estourariam o teto 6 (`koc_bracket_over_max`
    // rio abaixo).
    const plan = kocProposePhasePlan(20, 6, 900);
    expect(kocApplyPhaseEdit(plan, 0, {bracketCount: 1}, 6)).toEqual([]);
  });

  it('toda contagem que o sorteio aceita continua aceita na edição', () => {
    // O guard novo não pode recusar uma edição legítima: para qualquer campo,
    // toda contagem que `kocBracketCountOptions` oferece tem que produzir
    // chaves dentro de [piso, teto] — e por isso passar pelo guard.
    for (let n = 3; n <= 30; n++) {
      const plan = kocProposePhasePlan(n, 6, 900);
      for (const bracketCount of kocBracketCountOptions(n, 6)) {
        expect(kocApplyPhaseEdit(plan, 0, {bracketCount}, 6).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('plano de fases · total', () => {
  it('10 duplas dão 11 rodadas', () => {
    expect(kocPlanTotals(kocProposePhasePlan(10, 6, 900), 1).rounds).toBe(11);
  });

  it('mais quadras encurtam o relógio, não o número de rodadas', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const one = kocPlanTotals(plan, 1);
    const two = kocPlanTotals(plan, 2);
    expect(two.rounds).toBe(one.rounds);
    expect(two.seconds).toBeLessThan(one.seconds);
  });
});

/** Espelha `parseKocPhases` do servidor: sujeira em UMA fase derruba o plano
 *  INTEIRO — sem plano o servidor cai nas regras antigas, que funcionam; com
 *  plano meio lido, a tela prometeria um formato que a chave não tem. */
describe('plano de fases · parse do Firestore', () => {
  const validRaw = [
    {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
  ];

  it('plano bem formado passa e bate com o que a proposta produziria', () => {
    expect(parseKocPhases(validRaw)).toEqual(kocProposePhasePlan(10, 6, 900));
  });

  it('valor que não é array → null', () => {
    expect(parseKocPhases({})).toBeNull();
    expect(parseKocPhases('não é plano')).toBeNull();
    expect(parseKocPhases(null)).toBeNull();
    expect(parseKocPhases(undefined)).toBeNull();
  });

  it('array vazio → null', () => {
    expect(parseKocPhases([])).toBeNull();
  });

  it('item que não é objeto → null', () => {
    expect(parseKocPhases([...validRaw, 'não é fase'])).toBeNull();
    expect(parseKocPhases([null])).toBeNull();
  });

  it('bracketSizes ausente ou vazio → null', () => {
    expect(parseKocPhases([{roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}])).toBeNull();
    expect(parseKocPhases([{...validRaw[0], bracketSizes: []}])).toBeNull();
  });

  it('bracketSizes com valor não positivo → null', () => {
    expect(parseKocPhases([{...validRaw[0], bracketSizes: [5, 0]}])).toBeNull();
    expect(parseKocPhases([{...validRaw[0], bracketSizes: [5, -1]}])).toBeNull();
  });

  it('roundsPerBracket inválido → null', () => {
    expect(parseKocPhases([{...validRaw[0], roundsPerBracket: 0}])).toBeNull();
    expect(parseKocPhases([{...validRaw[0], roundsPerBracket: NaN}])).toBeNull();
  });

  it('qualifiersPerRound negativo → null, mas 0 (final) passa', () => {
    expect(parseKocPhases([{...validRaw[0], qualifiersPerRound: -1}])).toBeNull();
    expect(parseKocPhases([validRaw[2]])).not.toBeNull(); // final legítima: qualifiersPerRound 0
  });

  it('durationSec inválido → null', () => {
    expect(parseKocPhases([{...validRaw[0], durationSec: 0}])).toBeNull();
    expect(parseKocPhases([{...validRaw[0], durationSec: -900}])).toBeNull();
  });

  it('sujeira em uma única fase derruba o plano inteiro, não só ela', () => {
    const dirty = [validRaw[0], {...validRaw[1], roundsPerBracket: 0}, validRaw[2]];
    expect(parseKocPhases(dirty)).toBeNull();
  });
});

/** Duração não refaz a CHAVE, só o relógio — por isso fica de fora da
 *  comparação (ver `kocPlansMatch`). Tudo o mais que muda o formato do
 *  torneio entra. */
describe('plano de fases · comparação de identidade', () => {
  const plan = kocProposePhasePlan(10, 6, 900);

  it('plano igual a si mesmo bate', () => {
    expect(kocPlansMatch(plan, kocProposePhasePlan(10, 6, 900))).toBe(true);
  });

  it('duração diferente ainda bate', () => {
    const withOtherDuration = plan.map((p) => ({...p, durationSec: 1200}));
    expect(kocPlansMatch(plan, withOtherDuration)).toBe(true);
  });

  it('número de fases diferente não bate', () => {
    expect(kocPlansMatch(plan, plan.slice(0, 2))).toBe(false);
  });

  it('roundsPerBracket diferente não bate', () => {
    const changed = plan.map((p, i) => (i === 0 ? {...p, roundsPerBracket: p.roundsPerBracket + 1} : p));
    expect(kocPlansMatch(plan, changed)).toBe(false);
  });

  it('qualifiersPerRound diferente não bate', () => {
    const changed = plan.map((p, i) => (i === 0 ? {...p, qualifiersPerRound: p.qualifiersPerRound + 1} : p));
    expect(kocPlansMatch(plan, changed)).toBe(false);
  });

  it('quantidade de chaves diferente na mesma fase não bate', () => {
    const changed = plan.map((p, i) => (i === 0 ? {...p, bracketSizes: [...p.bracketSizes, 1]} : p));
    expect(kocPlansMatch(plan, changed)).toBe(false);
  });

  it('tamanho de uma chave diferente não bate', () => {
    const changed = plan.map((p, i) =>
      i === 0 ? {...p, bracketSizes: [p.bracketSizes[0] + 1, p.bracketSizes[1] - 1]} : p);
    expect(kocPlansMatch(plan, changed)).toBe(false);
  });
});
