import type { LiveScoreFields } from '../data/live-set-display';
import { FIRE_MIN_STREAK, fireLevelOf, nextStreakOf, type TeamStreak } from './telao-streaks';

/** A sequência é derivada do stream do doc (sem listener de pointEvents): pontos de um lado
 *  sobem e do outro não → ponto seguido. Precisa funcionar igual pra mesa ponto a ponto e pro
 *  lançamento rápido (agregado liveScore). */
describe('telao-streaks', () => {
  function live(a: number, b: number, extra?: Partial<LiveScoreFields>): LiveScoreFields {
    return { status: 'in_progress', sets: [{ a, b }], currentSetIndex: 0, liveScore: null, bestOf: 3, ...extra };
  }

  function run(points: Array<[number, number]>): TeamStreak | null {
    let s: TeamStreak | null = null;
    for (const [a, b] of points) s = nextStreakOf(s, live(a, b));
    return s;
  }

  it('conta pontos seguidos do mesmo lado', () => {
    const s = run([
      [10, 8],
      [11, 8],
      [12, 8],
      [13, 8],
    ]);
    expect(s?.side).toBe('A');
    expect(s?.count).toBe(3);
  });

  it('ponto do outro lado zera e recomeça a contagem', () => {
    const s = run([
      [10, 8],
      [11, 8],
      [12, 8],
      [12, 9],
    ]);
    expect(s?.side).toBe('B');
    expect(s?.count).toBe(1);
  });

  it('salto de mais de um ponto do mesmo lado conta inteiro (lançamento rápido)', () => {
    const s = run([
      [10, 8],
      [13, 8],
    ]);
    expect(s?.side).toBe('A');
    expect(s?.count).toBe(3);
  });

  it('os dois lados mudando junto (sync atrasado) zera a sequência', () => {
    const s = run([
      [10, 8],
      [11, 8],
      [13, 10],
    ]);
    expect(s?.count).toBe(0);
    expect(s?.side).toBeNull();
  });

  it('undo (placar diminui) zera a sequência', () => {
    const s = run([
      [10, 8],
      [11, 8],
      [10, 8],
    ]);
    expect(s?.count).toBe(0);
  });

  it('troca de set zera a sequência', () => {
    let s = run([
      [19, 8],
      [20, 8],
      [21, 8],
    ]);
    // Set fechou: partida segue no set 2 (novo set corrente dentro de sets[]).
    s = nextStreakOf(s, {
      status: 'in_progress',
      sets: [
        { a: 21, b: 8 },
        { a: 1, b: 0 },
      ],
      currentSetIndex: 1,
      liveScore: null,
      bestOf: 3,
    });
    expect(s?.count).toBe(0);
    expect(s?.setNumber).toBe(2);
  });

  it('fora do ao vivo (encerrada/entre sets) → null', () => {
    const prev = run([
      [10, 8],
      [11, 8],
    ]);
    expect(nextStreakOf(prev, { status: 'completed', sets: [{ a: 21, b: 8 }], currentSetIndex: 0, liveScore: null, bestOf: 3 })).toBeNull();
  });

  it('agregado liveScore (sem sets[]) também conta', () => {
    const q = (ga: number, gb: number): LiveScoreFields => ({
      status: 'in_progress',
      sets: [],
      currentSetIndex: null,
      liveScore: { setsA: 0, setsB: 0, currentGamesA: ga, currentGamesB: gb },
      bestOf: 3,
    });
    let s = nextStreakOf(null, q(5, 2));
    s = nextStreakOf(s, q(6, 2));
    s = nextStreakOf(s, q(7, 2));
    s = nextStreakOf(s, q(8, 2));
    expect(s?.side).toBe('A');
    expect(s?.count).toBe(3);
  });

  describe('fireLevelOf', () => {
    it('abaixo de 3 seguidos não acende', () => {
      expect(FIRE_MIN_STREAK).toBe(3);
      expect(fireLevelOf(0)).toBe(0);
      expect(fireLevelOf(2)).toBe(0);
    });

    it('níveis crescem com a sequência e travam no máximo', () => {
      expect(fireLevelOf(3)).toBe(1);
      expect(fireLevelOf(4)).toBe(1);
      expect(fireLevelOf(5)).toBe(2);
      expect(fireLevelOf(6)).toBe(2);
      expect(fireLevelOf(7)).toBe(3);
      expect(fireLevelOf(12)).toBe(3);
    });
  });
});
