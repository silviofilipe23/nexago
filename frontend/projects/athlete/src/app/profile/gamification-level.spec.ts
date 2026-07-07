import { computeLevelProgress } from './gamification-level';

describe('computeLevelProgress', () => {
  it('returns zero progress at the very start', () => {
    expect(computeLevelProgress(0, 0)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
  });

  it('computes xp-in-level and xp-to-next for a mid-level value', () => {
    expect(computeLevelProgress(340, 3)).toEqual({ xpInLevel: 40, xpForNextLevel: 60, progressRatio: 0.4 });
  });

  it('treats negative or non-finite xp as zero', () => {
    expect(computeLevelProgress(-10, 0)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
    expect(computeLevelProgress(Number.NaN, 0)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
  });

  it('handles xp landing exactly on a level boundary', () => {
    expect(computeLevelProgress(100, 1)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
  });
});
