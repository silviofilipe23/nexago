import {
  CATEGORY_LEVEL_PRESETS,
  SKILL_LEVEL_LABEL,
  categoryTags,
  emptyCategoryDraft,
  emptyTournamentDraft,
  skillLevelOptionsForSport,
  suggestCategoryName,
  type SkillLevel,
} from './tournament-create.model';
import { categoryFromMap, categoryToMap } from './tournament-create-mapper';

describe('skillLevelOptionsForSport', () => {
  it('oferece a escada única de 7 níveis para todos os esportes (incl. footvolley)', () => {
    const expected: SkillLevel[] = ['iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2', 'open'];
    expect(skillLevelOptionsForSport('footvolley')).toEqual(expected);
    expect(skillLevelOptionsForSport('beachVolleyball')).toEqual(expected);
    expect(skillLevelOptionsForSport('indoorVolleyball')).toEqual(expected);
  });

  it('grava categorias com os labels canônicos da escada de 7', () => {
    expect(skillLevelOptionsForSport('footvolley').map((code) => SKILL_LEVEL_LABEL[code])).toEqual([
      'Iniciante 1',
      'Iniciante 2',
      'Intermediário 1',
      'Intermediário 2',
      'Avançado 1',
      'Avançado 2',
      'Open',
    ]);
  });

  it('editor oferece os 7 degraus', () => {
    expect(skillLevelOptionsForSport('beachVolleyball').length).toBe(7);
  });
});

describe('minSkillLevel (mín. de nível da categoria)', () => {
  it('serializa e reidrata minLevel como label', () => {
    const cat = { ...emptyCategoryDraft('c1'), skillLevel: 'open' as const, minSkillLevel: 'avancado1' as const };
    const map = categoryToMap(cat, emptyTournamentDraft());
    expect(map['minLevel']).toBe('Avançado 1');
    expect(map['level']).toBe('Open');
    const back = categoryFromMap(map);
    expect(back?.minSkillLevel).toBe('avancado1');
  });

  it('minLevel ausente reidrata como null (categoria antiga)', () => {
    const map = categoryToMap(emptyCategoryDraft('c1'), emptyTournamentDraft());
    delete map['minLevel'];
    expect(categoryFromMap(map)?.minSkillLevel).toBeNull();
  });
});

describe('nome/tags do preset Open (min === max)', () => {
  const openPreset = CATEGORY_LEVEL_PRESETS.find((p) => p.label === 'Open')!;
  const elitePreset = CATEGORY_LEVEL_PRESETS.find((p) => p.label === 'Elite')!;

  it('preset Open nomeia só "Open", sem "mín. Open" duplicado', () => {
    const cat = { ...emptyCategoryDraft('c1'), skillLevel: openPreset.max, minSkillLevel: openPreset.min };
    expect(suggestCategoryName(cat)).toContain('Open');
    expect(suggestCategoryName(cat)).not.toContain('mín.');
    expect(categoryTags(cat)).toContain('Open');
    expect(categoryTags(cat).some((t) => t.startsWith('mín.'))).toBe(false);
  });

  it('preset Elite mantém "mín. Avançado 1" (min !== max)', () => {
    const cat = { ...emptyCategoryDraft('c1'), skillLevel: elitePreset.max, minSkillLevel: elitePreset.min };
    expect(suggestCategoryName(cat)).toContain('mín. Avançado 1');
    expect(categoryTags(cat)).toContain('mín. Avançado 1');
  });
});
