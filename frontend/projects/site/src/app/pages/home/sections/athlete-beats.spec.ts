import {
  ATHLETE,
  ATHLETE_BEATS,
  MISSIONS,
  MISSIONS_PER_DAY,
  RANKING,
  RANKING_CLIMB,
  RECENT_MATCHES,
  STATS,
  levelProgress,
  myPosition,
  pointsToPromotion,
  reached,
  recentForm,
  winRate,
} from './athlete-beats';

const STEPS = ATHLETE_BEATS.map((beat) => beat.step);

describe('cena Atleta', () => {
  it('passa por cada passo uma vez, na ordem em que a ficha se preenche', () => {
    expect(STEPS).toEqual(['focus', 'history', 'level', 'ranking', 'xp', 'share']);
  });

  it('acende cada casa da ficha no seu passo e nunca mais apaga', () => {
    for (const stat of STATS) {
      const lit = STEPS.map((step) => reached(step, stat));
      const first = STEPS.indexOf(stat);
      expect(lit).toEqual(STEPS.map((_, index) => index >= first));
    }
  });

  it('começa sem nenhuma casa acesa e termina com todas', () => {
    expect(STATS.some((stat) => reached('focus', stat))).toBeFalse();
    expect(STATS.every((stat) => reached('share', stat))).toBeTrue();
  });

  it('resume na ficha as mesmas partidas que a tela do histórico lista', () => {
    expect(recentForm()).toEqual(['win', 'loss', 'win', 'win', 'win']);
    expect(recentForm().length).toBe(RECENT_MATCHES.length);
    expect(RECENT_MATCHES[0].round).toBe('Semifinal');
    expect(RECENT_MATCHES[0].result).toBe('win');
  });

  it('calcula o aproveitamento pelos jogos e vitórias da ficha', () => {
    expect(winRate(ATHLETE.wins, ATHLETE.games)).toBe(66);
    expect(winRate(0, 0)).toBe(0);
  });

  it('só chama de "top 10" quem entrou no top 10 nesta etapa', () => {
    const now = myPosition();
    expect(now).toBe(9);
    expect(now).toBeLessThanOrEqual(10);
    expect(now + RANKING_CLIMB).toBeGreaterThan(10);
  });

  it('mantém o recorte do ranking em ordem de pontos', () => {
    const points = RANKING.map((row) => row.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(RANKING.filter((row) => row.you).length).toBe(1);
  });

  it('mostra um nível dentro da própria faixa, ainda a caminho do próximo', () => {
    const { level } = ATHLETE;
    expect(level.dropAt).toBeLessThan(level.startAt);
    expect(level.points).toBeGreaterThanOrEqual(level.startAt);
    expect(level.points).toBeLessThan(level.promoteAt);
    expect(pointsToPromotion(level)).toBe(60);
    expect(levelProgress(level)).toBe(60);
  });

  it('não promete mais missões feitas do que o dia tem', () => {
    expect(MISSIONS.length).toBeLessThanOrEqual(MISSIONS_PER_DAY);
    expect(MISSIONS.filter((mission) => mission.done).length).toBeLessThan(MISSIONS.length);
  });
});
