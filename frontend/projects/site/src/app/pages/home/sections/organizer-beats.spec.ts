import {
  CHAMPIONS,
  EVENT,
  LIVE,
  MATCH_IDS,
  ORGANIZER_BEATS,
  RUNNERS_UP,
  TEAMS,
  collected,
  matchView,
  reached,
  scheduleGrid,
  winnerOf,
  type OrganizerStep,
} from './organizer-beats';

const STEPS = ORGANIZER_BEATS.map((beat) => beat.step);
const views = (step: OrganizerStep) => MATCH_IDS.map((id) => matchView(step, id));

describe('cena Organizador', () => {
  it('passa por cada passo uma vez, na ordem em que um torneio acontece', () => {
    expect(STEPS).toEqual(['signup', 'draw', 'schedule', 'live', 'podium']);
    expect(reached('draw', 'schedule')).toBeFalse();
    expect(reached('podium', 'draw')).toBeTrue();
  });

  it('arrecada a taxa de cada dupla inscrita', () => {
    expect(collected()).toBe(TEAMS.length * EVENT.fee);
    expect(collected()).toBe(1280);
  });

  it('cruza as cabeças de chave do jeito padrão: 1 e 2 só se encontram na final', () => {
    const quarters = (['q1', 'q2', 'q3', 'q4'] as const).map((id) => matchView('draw', id));
    for (const match of quarters) {
      const seeds = [match.home.name, match.away.name].map((name) => TEAMS.indexOf(name as (typeof TEAMS)[number]) + 1);
      expect(seeds[0] + seeds[1]).toBe(9);
    }
    const final = matchView('podium', 'f');
    expect([final.home.name, final.away.name]).toEqual([TEAMS[0], TEAMS[1]]);
  });

  it('publica a chave só com as quartas definidas, sem hora nem placar', () => {
    for (const match of views('draw')) {
      expect(match.state).toBe('open');
      expect(match.scheduled).toBeFalse();
      expect(match.home.sets).toBeNull();
      const isQuarter = match.id.startsWith('q');
      expect(match.home.name === null).toBe(!isQuarter);
      expect(match.away.name === null).toBe(!isQuarter);
    }
  });

  it('agenda todas as partidas sem repetir quadra no mesmo horário', () => {
    const slots = views('schedule').map((match) => `${match.time}/${match.court}`);
    expect(views('schedule').every((match) => match.scheduled)).toBeTrue();
    expect(new Set(slots).size).toBe(MATCH_IDS.length);
  });

  it('nunca põe a mesma dupla em duas quadras ao mesmo tempo', () => {
    const byTime = new Map<string, string[]>();
    for (const match of views('podium')) {
      byTime.set(match.time, [...(byTime.get(match.time) ?? []), match.home.name!, match.away.name!]);
    }
    for (const names of byTime.values()) expect(new Set(names).size).toBe(names.length);
  });

  it('respeita a ordem da chave: semifinal depois das quartas, final por último', () => {
    const time = (id: (typeof MATCH_IDS)[number]) => matchView('schedule', id).time;
    expect(time('s1') > time('q1') && time('s1') > time('q2')).toBeTrue();
    expect(time('s2') > time('q3') && time('s2') > time('q4')).toBeTrue();
    expect(time('f') > time('s1') && time('f') > time('s2')).toBeTrue();
  });

  it('mostra na grade as mesmas partidas da chave', () => {
    const labels = scheduleGrid().flatMap((row) => row.courts.filter((cell): cell is string => cell !== null));
    expect(labels.sort()).toEqual(views('schedule').map((match) => match.label).sort());
  });

  it('tem uma partida só na mesa no passo ao vivo, com a chave já avançada', () => {
    const live = views('live').filter((match) => match.state === 'live');
    expect(live.map((match) => match.id)).toEqual([LIVE.id]);
    const final = matchView('live', 'f');
    expect(final.home.name).toBe(winnerOf('s1'));
    expect(final.away.name).toBeNull();
  });

  it('só avança quem venceu, e termina com o campeão que ganhou a final', () => {
    const done = views('podium');
    expect(done.every((match) => match.state === 'done')).toBeTrue();
    for (const match of done) {
      expect(match.home.won).not.toBe(match.away.won);
      const winner = match.home.won ? match.home : match.away;
      const loser = match.home.won ? match.away : match.home;
      expect(winner.sets).toBe(2);
      expect(loser.sets!).toBeLessThan(2);
      expect(winner.name).toBe(winnerOf(match.id));
    }
    expect(CHAMPIONS).toBe(winnerOf('f'));
    expect(RUNNERS_UP).not.toBe(CHAMPIONS);
  });
});
