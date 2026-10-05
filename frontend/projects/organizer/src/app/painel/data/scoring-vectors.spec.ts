import { matchWinnerSide, scoringProfileFromRaw, setWinnerSide, validateScoreSets } from '@nexago/sports';
import { SCORING_VECTORS } from '../../../../../../shared/sports/vectors.generated';

describe('@nexago/sports · vetores de placar compartilhados com functions e app', () => {
  SCORING_VECTORS.cases.forEach((c, i) => {
    it(`caso ${i} (${c.profile})`, () => {
      const profile = scoringProfileFromRaw(SCORING_VECTORS.profiles[c.profile]);
      expect(profile).withContext(c.profile).not.toBeNull();
      expect(c.sets.map((_, idx) => setWinnerSide(c.sets, idx, profile!))).toEqual([...c.setWinners]);
      expect(matchWinnerSide(c.sets, profile!)).toBe(c.matchWinner);
      expect(validateScoreSets(c.sets, profile!).map((x) => x.message)).toEqual([...c.issues]);
    });
  });
});
