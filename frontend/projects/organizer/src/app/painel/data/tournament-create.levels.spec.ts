import { SKILL_LEVEL_LABEL, skillLevelOptionsForSport, type SkillLevel } from './tournament-create.model';

describe('skillLevelOptionsForSport', () => {
  it('oferece a escada única de 5 níveis para todos os esportes (incl. footvolley)', () => {
    const expected: SkillLevel[] = ['iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'open'];
    expect(skillLevelOptionsForSport('footvolley')).toEqual(expected);
    expect(skillLevelOptionsForSport('beachVolleyball')).toEqual(expected);
    expect(skillLevelOptionsForSport('indoorVolleyball')).toEqual(expected);
  });

  it('grava categorias com os labels canônicos da escada de 5', () => {
    expect(skillLevelOptionsForSport('footvolley').map((code) => SKILL_LEVEL_LABEL[code])).toEqual([
      'Iniciante 1',
      'Iniciante 2',
      'Intermediário 1',
      'Intermediário 2',
      'Open',
    ]);
  });
});
