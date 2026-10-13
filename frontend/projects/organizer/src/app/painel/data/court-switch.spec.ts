import { courtSwitchInterval, isCourtSwitchDue, scoringProfileFromRaw, legacyScoringProfile } from '@nexago/sports';
import { SCORING_VECTORS } from '../../../../../../shared/sports/vectors.generated';

const profile = (key: string) => scoringProfileFromRaw(SCORING_VECTORS.profiles[key])!;

describe('@nexago/sports · troca de quadra por pontos (espelho do app)', () => {
  const beach3 = legacyScoringProfile(3);

  it('vôlei de praia: 7 nos sets de 21 e 5 no decisivo de 15', () => {
    expect(courtSwitchInterval(beach3, 0)).toBe(7);
    expect(courtSwitchInterval(beach3, 1)).toBe(7);
    expect(courtSwitchInterval(beach3, 2)).toBe(5);
    expect(courtSwitchInterval(legacyScoringProfile(1), 0)).toBe(7);
  });

  it('sem a regra: vôlei de quadra (25) e esportes de games', () => {
    for (const key of ['indoor3', 'bt3', 'tennis3']) {
      expect(courtSwitchInterval(profile(key), 0)).withContext(key).toBeNull();
    }
  });

  it('avisa no múltiplo, nunca em 0 a 0', () => {
    const due = (idx: number, a: number, b: number) => isCourtSwitchDue(beach3, idx, { a, b });
    expect(due(0, 0, 0)).toBeFalse();
    expect(due(0, 4, 3)).toBeTrue();
    expect(due(0, 7, 8)).toBeFalse();
    expect(due(0, 11, 10)).toBeTrue();
    expect(due(2, 3, 2)).toBeTrue();
    expect(due(2, 4, 3)).toBeFalse();
  });
});
