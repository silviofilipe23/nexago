import {
  effectiveScoringProfile,
  legacyScoringProfile,
  matchWinnerSide,
  normalizeQuickSet,
  quickSetKind,
  scoringProfileFromRaw,
  scoringRulesLabel,
  setScoreText,
  setTargetLabel,
  setWinnerSide,
  validateScoreSets,
} from '@nexago/sports';
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

describe('@nexago/sports · rótulos e lançamento rápido (vetores)', () => {
  SCORING_VECTORS.labelVectors.forEach((v) => {
    it(`rótulos ${v.profile}`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      expect(scoringRulesLabel(p)).toBe(v.rulesLabel);
      expect(v.setLabels.map((_, i) => setTargetLabel(p, i))).toEqual([...v.setLabels]);
    });
  });
  SCORING_VECTORS.quickVectors.forEach((v, i) => {
    it(`linha de set ${i} (${v.profile})`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      expect(quickSetKind(p, v.index, v.set)).toBe(v.kind);
      expect(normalizeQuickSet(p, v.index, v.set)).toEqual(v.normalized);
    });
  });
  SCORING_VECTORS.textVectors.forEach((v, i) => {
    it(`texto do set ${i} (${v.profile})`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      expect(setScoreText(p, v.index, v.set)).toBe(v.text);
    });
  });
  it('perfil efetivo: carimbo com o bestOf da tela; sem carimbo, histórico', () => {
    const p = effectiveScoringProfile(SCORING_VECTORS.profiles['bt3'], 1);
    expect(p.kind).toBe('sets_games');
    expect(p.bestOf).toBe(1);
    expect(effectiveScoringProfile(undefined, 1)).toEqual(legacyScoringProfile(1));
    expect(effectiveScoringProfile({ kind: 'x' }, 'abc')).toEqual(legacyScoringProfile(3));
  });
});
