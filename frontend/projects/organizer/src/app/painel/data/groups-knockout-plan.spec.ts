import {
  describeByeHolders,
  describeGroupSizes,
  estimateDurationMin,
  firstRoundPairings,
  formatDuration,
  groupSizesFor,
  maxGroupCount,
  maxQualifiersPerGroup,
  nearestValidFormat,
  planGroupsKnockout,
  suggestGroupFormats,
} from './groups-knockout-plan';

describe('groupSizesFor', () => {
  it('divide por igual quando fecha', () => {
    expect(groupSizesFor(16, 4)).toEqual([4, 4, 4, 4]);
  });

  it('a sobra vai uma por grupo — nunca mais de 1 de diferença', () => {
    expect(groupSizesFor(14, 4)).toEqual([4, 4, 3, 3]);
    expect(groupSizesFor(10, 3)).toEqual([4, 3, 3]);
  });

  it('sem duplas ou sem grupos não há o que dividir', () => {
    expect(groupSizesFor(0, 4)).toEqual([]);
    expect(groupSizesFor(8, 0)).toEqual([]);
  });
});

describe('describeGroupSizes', () => {
  it('grupos iguais', () => {
    expect(describeGroupSizes([4, 4, 4, 4])).toBe('4 grupos de 4');
    expect(describeGroupSizes([8])).toBe('1 grupo de 8');
  });

  it('grupos desiguais', () => {
    expect(describeGroupSizes([4, 4, 3, 3])).toBe('2 grupos de 4 e 2 de 3');
    expect(describeGroupSizes([4, 3, 3])).toBe('1 grupo de 4 e 2 de 3');
  });
});

describe('describeByeHolders', () => {
  it('folgas vão primeiro para os melhores 1ºs', () => {
    expect(describeByeHolders(1, 3)).toBe('o melhor 1º colocado');
    expect(describeByeHolders(2, 3)).toBe('os 2 melhores 1ºs colocados');
  });

  it('quando cobrem todos os 1ºs, seguem para os 2ºs', () => {
    expect(describeByeHolders(4, 4)).toBe('todos os 1ºs colocados');
    expect(describeByeHolders(6, 5)).toBe('todos os 1ºs colocados e o melhor 2º colocado');
    expect(describeByeHolders(7, 5)).toBe('todos os 1ºs colocados e os 2 melhores 2ºs colocados');
  });

  it('sem folga não há o que descrever', () => {
    expect(describeByeHolders(0, 4)).toBe('');
  });
});

describe('planGroupsKnockout', () => {
  it('16 duplas, 4 grupos, 2 classificam: quartas diretas', () => {
    const plan = planGroupsKnockout(16, 4, 2);
    expect(plan.groupSizes).toEqual([4, 4, 4, 4]);
    expect(plan.groupMatches).toBe(24);
    expect(plan.qualifiers).toBe(8);
    expect(plan.byes).toBe(0);
    expect(plan.seeding).toBe('crossover');
    expect(plan.phases).toEqual([
      { label: 'Quartas', matches: 4, byes: 0 },
      { label: 'Semifinais', matches: 2, byes: 0 },
      { label: 'Final', matches: 1, byes: 0 },
    ]);
    expect(plan.thirdPlace).toBeTrue();
    expect(plan.knockoutMatches).toBe(8);
    expect(plan.totalMatches).toBe(32);
    expect(plan.eliminatedInGroups).toBe(8);
    expect(plan.minMatchesPerTeam).toBe(3);
    expect(plan.maxMatchesPerTeam).toBe(6);
    expect(plan.issue).toBeNull();
  });

  it('10 duplas, 3 grupos, 2 classificam: 6 classificados, 2 folgas nas quartas', () => {
    const plan = planGroupsKnockout(10, 3, 2);
    expect(plan.groupSizes).toEqual([4, 3, 3]);
    expect(plan.groupMatches).toBe(12);
    expect(plan.qualifiers).toBe(6);
    expect(plan.bracketSize).toBe(8);
    expect(plan.byes).toBe(2);
    expect(plan.seeding).toBe('ranked');
    expect(plan.phases).toEqual([
      { label: 'Quartas', matches: 2, byes: 2 },
      { label: 'Semifinais', matches: 2, byes: 0 },
      { label: 'Final', matches: 1, byes: 0 },
    ]);
    // 2 quartas + 2 semis + final + 3º lugar.
    expect(plan.knockoutMatches).toBe(6);
    expect(plan.totalMatches).toBe(18);
    expect(plan.issue).toBeNull();
  });

  it('3 classificados: uma semifinal, o melhor 1º espera na final, sem 3º lugar', () => {
    const plan = planGroupsKnockout(9, 3, 1);
    expect(plan.phases).toEqual([
      { label: 'Semifinais', matches: 1, byes: 1 },
      { label: 'Final', matches: 1, byes: 0 },
    ]);
    expect(plan.thirdPlace).toBeFalse();
    expect(plan.knockoutMatches).toBe(2);
  });

  it('2 classificados: só a final', () => {
    const plan = planGroupsKnockout(8, 2, 1);
    expect(plan.phases).toEqual([{ label: 'Final', matches: 1, byes: 0 }]);
    expect(plan.thirdPlace).toBeFalse();
    expect(plan.knockoutMatches).toBe(1);
  });

  it('um classificado só não forma mata-mata', () => {
    expect(planGroupsKnockout(6, 1, 1).issue).toBe('too_few_qualifiers');
  });

  it('grupo menor que o número de classificados é recusado (mesma regra do servidor)', () => {
    expect(planGroupsKnockout(6, 3, 3).issue).toBe('group_too_small');
  });

  it('menos de 2 duplas: nada a planejar', () => {
    expect(planGroupsKnockout(1, 1, 1).issue).toBe('too_few_teams');
  });
});

describe('limites dos controles', () => {
  it('no máximo um grupo para cada 2 duplas', () => {
    expect(maxGroupCount(10)).toBe(5);
    expect(maxGroupCount(3)).toBe(1);
    expect(maxGroupCount(0)).toBe(1);
  });

  it('sempre sobra alguém eliminado no menor grupo', () => {
    expect(maxQualifiersPerGroup(16, 4)).toBe(3);
    expect(maxQualifiersPerGroup(10, 3)).toBe(2);
    expect(maxQualifiersPerGroup(4, 2)).toBe(1);
  });
});

describe('suggestGroupFormats', () => {
  it('só sugere formato que o servidor aceita', () => {
    for (let teams = 4; teams <= 40; teams++) {
      for (const plan of suggestGroupFormats(teams)) {
        expect(plan.issue).withContext(`${teams} duplas`).toBeNull();
      }
    }
  });

  it('10 duplas: oferece 2 e 3 grupos', () => {
    const options = suggestGroupFormats(10).map((p) => `${p.groupCount}x${p.qualifiersPerGroup}`);
    expect(options).toContain('2x2');
    expect(options).toContain('3x2');
  });

  it('16 duplas: o clássico 4 grupos × 2 vem primeiro', () => {
    const [first] = suggestGroupFormats(16);
    expect(first?.groupCount).toBe(4);
    expect(first?.qualifiersPerGroup).toBe(2);
  });

  it('respeita o limite e não repete combinação', () => {
    const options = suggestGroupFormats(32, 5);
    expect(options.length).toBeLessThanOrEqual(5);
    const keys = options.map((p) => `${p.groupCount}x${p.qualifiersPerGroup}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('poucas duplas: nenhuma sugestão em vez de sugestão quebrada', () => {
    expect(suggestGroupFormats(3)).toEqual([]);
  });
});

describe('nearestValidFormat', () => {
  it('devolve o próprio formato quando ele já vale', () => {
    const fix = nearestValidFormat(16, 4, 2);
    expect(fix?.groupCount).toBe(4);
    expect(fix?.qualifiersPerGroup).toBe(2);
  });

  it('um grupo com um classificado: sugere subir os classificados', () => {
    const fix = nearestValidFormat(6, 1, 1);
    expect(fix?.issue).toBeNull();
    expect(fix?.groupCount).toBe(1);
    expect(fix?.qualifiersPerGroup).toBe(2);
  });
});

/** MESMO gabarito de `functions/src/groups-knockout-ranked.test.ts` — a prévia
 *  desta tela é cópia da regra do servidor, e os dois specs prendem os mesmos
 *  valores para a cópia não derivar. */
describe('firstRoundPairings — gabarito do servidor', () => {
  const GOLDEN: Array<[number, number, Array<[string, string | null]>]> = [
    [2, 2, [['1º Grupo A', '2º Grupo B'], ['2º Grupo A', '1º Grupo B']]],
    [4, 2, [['1º Grupo A', '2º Grupo D'], ['1º Grupo B', '2º Grupo C'], ['1º Grupo C', '2º Grupo B'], ['1º Grupo D', '2º Grupo A']]],
    [8, 1, [['1º Grupo A', '1º Grupo H'], ['1º Grupo B', '1º Grupo G'], ['1º Grupo C', '1º Grupo F'], ['1º Grupo D', '1º Grupo E']]],
    [3, 2, [['Melhor 1º', null], ['Melhor 2º', '2º melhor 2º'], ['2º melhor 1º', null], ['3º melhor 1º', '3º melhor 2º']]],
    [3, 1, [['Melhor 1º', null], ['2º melhor 1º', '3º melhor 1º']]],
    [5, 2, [
      ['Melhor 1º', null], ['3º melhor 2º', '4º melhor 2º'], ['4º melhor 1º', null], ['5º melhor 1º', null],
      ['2º melhor 1º', null], ['2º melhor 2º', '5º melhor 2º'], ['3º melhor 1º', null], ['Melhor 2º', null],
    ]],
  ];

  for (const [groupCount, qualifiers, expected] of GOLDEN) {
    it(`${groupCount} grupos × ${qualifiers}`, () => {
      expect(firstRoundPairings(groupCount, qualifiers).map((p) => [p.a, p.b])).toEqual(expected);
    });
  }
});

describe('duração estimada', () => {
  it('jogos × duração ÷ quadras, arredondando a última leva pra cima', () => {
    expect(estimateDurationMin(32, 30, 4)).toBe(240);
    expect(estimateDurationMin(18, 30, 4)).toBe(150);
  });

  it('sem quadra cadastrada conta uma', () => {
    expect(estimateDurationMin(10, 30, 0)).toBe(300);
  });

  it('formata em horas e minutos', () => {
    expect(formatDuration(240)).toBe('4h');
    expect(formatDuration(150)).toBe('2h30');
    expect(formatDuration(45)).toBe('45 min');
  });
});
