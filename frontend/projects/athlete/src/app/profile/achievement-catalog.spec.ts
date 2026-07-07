import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';

describe('achievement-catalog', () => {
  it('has exactly 24 achievements', () => {
    expect(ACHIEVEMENT_CATALOG.length).toBe(24);
  });

  it('has unique ids', () => {
    const ids = ACHIEVEMENT_CATALOG.map((def) => def.id);
    expect(new Set(ids).size).toBe(24);
  });

  describe('buildAchievementViewModels', () => {
    it('marks nothing unlocked and preserves catalog order for an empty set', () => {
      const result = buildAchievementViewModels(new Set());
      expect(result.length).toBe(24);
      expect(result.every((item) => !item.unlocked)).toBe(true);
      expect(result.map((item) => item.id)).toEqual(ACHIEVEMENT_CATALOG.map((def) => def.id));
    });

    it('moves unlocked achievements to the front, keeping catalog order among them', () => {
      const result = buildAchievementViewModels(new Set(['STREAK_3', 'WELCOME']));
      expect(result.filter((item) => item.unlocked).map((item) => item.id)).toEqual(['WELCOME', 'STREAK_3']);
      expect(result.length).toBe(24);
    });
  });
});
