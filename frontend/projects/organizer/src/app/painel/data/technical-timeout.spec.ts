import {
  EMPTY_TECHNICAL_TIMEOUT_COUNTS,
  TECHNICAL_TIMEOUT_SECONDS,
  buildTechnicalTimeoutStartWrite,
  canCallTechnicalTimeout,
  countTechnicalTimeout,
  technicalTimeoutFromRaw,
  technicalTimeoutRemainingSeconds,
  type LiveMatch,
} from '@nexago/live-scoring';
import { isAutoTechnicalTimeoutDue, legacyScoringProfile, scoringProfileFromRaw } from '@nexago/sports';
import { SCORING_VECTORS } from '../../../../../../shared/sports/vectors.generated';

describe('technical-timeout (cota e contagem da mesa)', () => {
  it('gasta a cota do lado que chamou, sem tocar no outro', () => {
    const once = countTechnicalTimeout(EMPTY_TECHNICAL_TIMEOUT_COUNTS, 'A');
    expect(once).toEqual({ A: 1, B: 0 });
    expect(countTechnicalTimeout(once, 'A')).toEqual({ A: 2, B: 0 });
  });

  it('nega o 3º tempo do mesmo lado no set', () => {
    const counts = { A: 2, B: 0 };
    expect(canCallTechnicalTimeout(counts, 'A')).toBeFalse();
    expect(countTechnicalTimeout(counts, 'A')).toBe(counts);
    expect(canCallTechnicalTimeout(counts, 'B')).toBeTrue();
  });

  it('a contagem desce de 60 e para em 0', () => {
    const t = { startedAt: new Date(0), durationSec: TECHNICAL_TIMEOUT_SECONDS };
    expect(technicalTimeoutRemainingSeconds(t, new Date(0))).toBe(60);
    expect(technicalTimeoutRemainingSeconds(t, new Date(15_400))).toBe(45);
    expect(technicalTimeoutRemainingSeconds(t, new Date(90_000))).toBe(0);
  });

  describe('automático do 21º ponto', () => {
    const beach3 = legacyScoringProfile(3);
    const due = (idx: number, a: number, b: number) => isAutoTechnicalTimeoutDue(beach3, idx, { a, b });

    it('dispara com a soma do set em 21 nos sets de 21', () => {
      expect(due(0, 11, 10)).toBeTrue();
      expect(due(1, 4, 17)).toBeTrue();
      expect(isAutoTechnicalTimeoutDue(legacyScoringProfile(1), 0, { a: 10, b: 11 })).toBeTrue();
    });

    it('não dispara fora de 21 nem no decisivo de 15', () => {
      expect(due(0, 10, 10)).toBeFalse();
      expect(due(0, 12, 10)).toBeFalse();
      expect(due(2, 11, 10)).toBeFalse();
    });

    it('não dispara em vôlei de quadra (25) nem em esportes de games', () => {
      for (const key of ['indoor3', 'bt3', 'tennis3']) {
        const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[key])!;
        expect(isAutoTechnicalTimeoutDue(p, 0, { a: 11, b: 10 })).withContext(key).toBeFalse();
      }
    });

    it('grava o minuto sem dupla, marcado como automático', () => {
      const m = { status: 'in_progress', currentSetIndex: 0, bestOf: 3, sets: [{ a: 11, b: 10 }], teamAId: 'ta', teamBId: 'tb', servingTeamId: 'ta' } as unknown as LiveMatch;
      const w = buildTechnicalTimeoutStartWrite(m, { auto: true })!;
      const tt = w.matchUpdate['technicalTimeout'] as Record<string, unknown>;
      expect(tt['auto']).toBeTrue();
      expect('side' in tt).toBeFalse();
      expect(tt['scoreA']).toBe(11);
      expect(w.pointEvent['type']).toBe('technical-timeout');
      expect(w.pointEvent['auto']).toBeTrue();
    });

    it('lê o automático do doc; sem lado e sem `auto` continua inválido', () => {
      const parsed = technicalTimeoutFromRaw({ auto: true, durationSec: 60, setIndex: 0, scoreA: 11, scoreB: 10 });
      expect(parsed?.auto).toBeTrue();
      expect(parsed?.side).toBeNull();
      expect(technicalTimeoutFromRaw({ durationSec: 60 })).toBeNull();
      expect(technicalTimeoutFromRaw({ side: 'B', teamId: 'tb' })?.auto).toBeFalse();
    });
  });
});
