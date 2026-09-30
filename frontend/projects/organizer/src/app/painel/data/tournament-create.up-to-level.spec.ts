import {
  SKILL_LEVEL_LADDER,
  categoryTags,
  categoryUpToLevel,
  emptyCategoryDraft,
  emptyTournamentDraft,
  suggestCategoryName,
  upToLevelHint,
  type SkillLevel,
} from './tournament-create.model';
import { categoryFromMap, categoryToMap } from './tournament-create-mapper';

/** Faixa "até X" — piso Iniciante 1, teto X (spec 2026-09-30). */
function upTo(max: SkillLevel) {
  return { ...emptyCategoryDraft('c1'), minSkillLevel: 'iniciante1' as const, skillLevel: max };
}

describe('categoryUpToLevel — faixa "até X"', () => {
  it('reconhece piso Iniciante 1 com teto fora dos presets', () => {
    const tetos: SkillLevel[] = ['iniciante1', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2'];
    for (const max of tetos) {
      expect(categoryUpToLevel(upTo(max))).withContext(max).toBe(max);
    }
  });

  it('0–1 e 0–6 são os presets Iniciante e Livre, não "até"', () => {
    expect(categoryUpToLevel(upTo('iniciante2'))).toBeNull();
    expect(categoryUpToLevel(upTo('open'))).toBeNull();
  });

  it('outro piso, piso ausente e teto legado não são "até"', () => {
    expect(categoryUpToLevel({ minSkillLevel: 'intermediario1', skillLevel: 'avancado2' })).toBeNull();
    expect(categoryUpToLevel({ minSkillLevel: null, skillLevel: 'intermediario2' })).toBeNull();
    expect(categoryUpToLevel({ minSkillLevel: 'iniciante1', skillLevel: 'beginner' })).toBeNull();
  });

  it('a escada é a de 7 níveis, em ordem crescente', () => {
    expect([...SKILL_LEVEL_LADDER]).toEqual([
      'iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2', 'open',
    ]);
  });
});

describe('nome e tags da faixa "até X"', () => {
  it('nome sugerido diz "até" o teto', () => {
    expect(suggestCategoryName(upTo('intermediario2'))).toBe('Masculino até Intermediário 2');
  });

  it('tag diz "até" o teto, sem "mín."', () => {
    const tags = categoryTags(upTo('avancado1'));
    expect(tags).toContain('até Avançado 1');
    expect(tags.some((t) => t.startsWith('mín.'))).toBeFalse();
  });

  it('presets com piso Iniciante 1 mantêm o nome de hoje', () => {
    expect(suggestCategoryName(upTo('open'))).toBe('Masculino');
    expect(suggestCategoryName(upTo('iniciante2'))).toBe('Masculino Iniciante 2');
  });
});

describe('upToLevelHint', () => {
  it('explica o que a escolha libera', () => {
    expect(upToLevelHint('iniciante1')).toBe('Só atletas Iniciante 1. Quem está acima não se inscreve.');
    expect(upToLevelHint('iniciante2')).toBe(
      'Libera de Iniciante 1 até Iniciante 2. Quem está acima não se inscreve. Mesma regra do preset Iniciante.',
    );
    expect(upToLevelHint('intermediario2')).toBe(
      'Libera de Iniciante 1 até Intermediário 2. Quem está acima não se inscreve.',
    );
    expect(upToLevelHint('open')).toBe('Libera todos os níveis (mesma regra do Livre).');
  });
});

describe('persistência da faixa "até X"', () => {
  it('grava piso Iniciante 1 e teto X como labels e reabre igual', () => {
    const map = categoryToMap(upTo('intermediario2'), emptyTournamentDraft());
    expect(map['minLevel']).toBe('Iniciante 1');
    expect(map['level']).toBe('Intermediário 2');
    const back = categoryFromMap(map)!;
    expect(categoryUpToLevel(back)).toBe('intermediario2');
  });
});
