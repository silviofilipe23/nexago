import {
  EMPTY_TECHNICAL_TIMEOUT_COUNTS,
  TECHNICAL_TIMEOUT_SECONDS,
  canCallTechnicalTimeout,
  countTechnicalTimeout,
  technicalTimeoutRemainingSeconds,
} from '@nexago/live-scoring';

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
});
