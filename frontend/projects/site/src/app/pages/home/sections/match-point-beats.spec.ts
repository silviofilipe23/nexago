import { MATCH_BEATS, pointLog } from './match-point-beats';

describe('cena Match point', () => {
  it('conta uma sequência de pontos válida: um ponto por vez, para quem pontuou', () => {
    for (let i = 1; i < MATCH_BEATS.length; i++) {
      const before = MATCH_BEATS[i - 1];
      const now = MATCH_BEATS[i];
      expect(now.us - before.us).toBe(now.scorer === 'us' ? 1 : 0);
      expect(now.them - before.them).toBe(now.scorer === 'them' ? 1 : 0);
    }
  });

  it('só termina quando o set está de fato ganho (21 ou mais, com dois de vantagem)', () => {
    const closed = (b: { us: number; them: number }) => Math.max(b.us, b.them) >= 21 && Math.abs(b.us - b.them) >= 2;
    const last = MATCH_BEATS[MATCH_BEATS.length - 1];
    expect(closed(last)).toBeTrue();
    expect(last.us).toBeGreaterThan(last.them);
    expect(MATCH_BEATS.slice(0, -1).some(closed)).toBeFalse();
  });

  it('lista o ponto a ponto do mais recente para o mais antigo', () => {
    expect(pointLog(0)).toEqual([]);
    expect(pointLog(2)).toEqual([
      { score: '20–20', scorer: 'them' },
      { score: '20–19', scorer: 'us' },
    ]);
    expect(pointLog(4).length).toBe(4);
  });
});
