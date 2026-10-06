import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournamentCourt } from '../../painel/data/tournament.model';
import type { ScoringProfile } from '@nexago/sports';
import { courtNumberOf, multiCardsOf, multiColumnsOf, pointSituationOf } from './overlay-multi';

const NOW = Date.UTC(2026, 9, 6, 18, 0, 0);

function match(over: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1', tournamentId: 't', categoryId: 'c1', round: 'Semifinal', team1Label: 'A1 / A2', team2Label: 'B1 / B2',
    score: null, winnerSide: null, scheduledAt: null, court: null, status: 'in_progress', teamAId: 'ta', teamBId: 'tb',
    sets: [{ a: 10, b: 8 }], courtId: 'q1', scheduleEndAt: null, dayKey: '', bestOf: 3, matchType: 'group', roundNumber: 1,
    matchNumber: 1, winnerAdvanceMatchNumber: null, winnerAdvanceSlot: null, loserAdvanceMatchNumber: null, liveScore: null,
    currentSetIndex: 0, servingTeamId: 'ta', servingPlayerSlot: 0, medicalTimeout: null, matchStartedAt: new Date(NOW - 600_000),
    matchEndedAt: null, ...over,
  };
}
const courts: OrganizerTournamentCourt[] = [
  { id: 'q1', name: 'Quadra 1', order: 0 },
  { id: 'q2', name: 'Quadra 2', order: 1 },
];
const cat = () => 'Masculino B';

describe('overlay-multi', () => {
  it('colunas e número da quadra', () => {
    expect([1, 2, 3, 4, 5, 6].map(multiColumnsOf)).toEqual([1, 2, 3, 2, 3, 3]);
    expect(courtNumberOf({ name: 'Quadra 3' }, 0)).toBe(3);
    expect(courtNumberOf({ name: 'Central' }, 4)).toBe(5);
  });

  it('ao vivo com saque, contexto e sets', () => {
    const [c1] = multiCardsOf([match()], courts, cat, NOW);
    expect(c1?.status).toBe('live');
    expect(c1?.context).toBe('Masculino B · Semifinal');
    expect(c1?.a.serving).toBeTrue();
    expect(c1?.live).toEqual({ a: 10, b: 8 });
  });

  it('set point e match point', () => {
    expect(pointSituationOf(match(), { setNumber: 1, a: 20, b: 18 }, { a: 0, b: 0 })).toEqual({ side: 'A', matchPoint: false });
    expect(pointSituationOf(match(), { setNumber: 2, a: 18, b: 20 }, { a: 1, b: 0 })).toEqual({ side: 'B', matchPoint: false });
    expect(pointSituationOf(match(), { setNumber: 2, a: 20, b: 17 }, { a: 1, b: 0 })).toEqual({ side: 'A', matchPoint: true });
    expect(pointSituationOf(match(), { setNumber: 1, a: 20, b: 20 }, { a: 0, b: 0 }).side).toBeNull();
    const m = match({ sets: [{ a: 20, b: 18 }] });
    expect(multiCardsOf([m], courts, cat, NOW)[0]?.status).toBe('setpoint');
  });

  it('encerrada vira Final (com vencedor) por um tempo; depois a próxima agendada; senão livre', () => {
    const fim = match({ status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 21, b: 19 }], matchEndedAt: new Date(NOW - 60_000) });
    const c = multiCardsOf([fim], courts, cat, NOW)[0]!;
    expect(c.status).toBe('final');
    expect(c.winner).toBe('A');
    expect(c.sets.length).toBe(2);
    const velho = { ...fim, matchEndedAt: new Date(NOW - 3_600_000) };
    expect(multiCardsOf([velho], courts, cat, NOW)[0]?.status).toBe('free');
    const prox = match({ id: 'm2', status: 'scheduled', sets: [], scheduledAt: new Date(2026, 9, 6, 15, 40), matchStartedAt: null });
    const c2 = multiCardsOf([velho, prox], courts, cat, NOW)[0]!;
    expect(c2.status).toBe('scheduled');
    expect(c2.time).toBe('15:40');
  });

  it('ao vivo ganha da final e da próxima; uma partida por quadra', () => {
    const live = match();
    const fim = match({ id: 'm0', status: 'completed', matchEndedAt: new Date(NOW - 1000), sets: [{ a: 21, b: 10 }] });
    const cards = multiCardsOf([fim, live], courts, cat, NOW);
    expect(cards.length).toBe(2);
    expect(cards[0]?.matchId).toBe('m1');
    expect(cards[1]?.status).toBe('free');
  });

  describe('games (beach tennis e tênis)', () => {
    const beach: ScoringProfile = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };
    const tenis: ScoringProfile = { ...beach, noAd: false, decidingSet: 'full' };
    const gm = (over: Partial<TournamentMatch> = {}) =>
      match({ scoringProfile: beach, sets: [{ a: 6, b: 4 }, { a: 5, b: 3 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 }, ...over });

    it('mostra games do set, ponto do game e saque', () => {
      const c = multiCardsOf([gm({ currentGame: { a: 1, b: 2 } })], courts, cat, NOW)[0]!;
      expect(c.games).toBeTrue();
      expect(c.live).toEqual({ a: 5, b: 3 });
      expect(c.liveGame).toEqual({ a: '15', b: '30' });
      expect(c.sets).toEqual([{ a: 6, b: 4 }]);
      expect(c.status).toBe('live');
    });

    it('match point: o ponto fecha o set e a partida (1 set a 0)', () => {
      const c = multiCardsOf([gm()], courts, cat, NOW)[0]!;
      expect(c.status).toBe('matchpoint');
      expect(c.pointSide).toBe('A');
    });

    it('set point (sem fechar a partida) e sem destaque quando o ponto só fecha game', () => {
      const m = gm({ sets: [{ a: 4, b: 6 }, { a: 5, b: 3 }] });
      expect(multiCardsOf([m], courts, cat, NOW)[0]?.status).toBe('setpoint');
      const meio = gm({ sets: [{ a: 6, b: 4 }, { a: 2, b: 2 }], currentGame: { a: 3, b: 1 } });
      expect(multiCardsOf([meio], courts, cat, NOW)[0]?.status).toBe('live');
    });

    it('no-ad: no 40–40 o ponto decide o game (set point pra quem está a um game); com vantagem 40–40 ainda não decide', () => {
      const noAd = gm({ currentGame: { a: 3, b: 3 }, sets: [{ a: 6, b: 4 }, { a: 5, b: 3 }] });
      // 40–40 sem vantagem: o ponto seguinte decide o game; A (5–3) fecha o set 6–3, B só empata em 5–4.
      expect(multiCardsOf([noAd], courts, cat, NOW)[0]?.pointSide).toBe('A');
      const ad = gm({ scoringProfile: tenis, currentGame: { a: 3, b: 3 } });
      expect(multiCardsOf([ad], courts, cat, NOW)[0]?.pointSide).toBeNull();
    });

    it('tie-break do set e super tie-break', () => {
      const tb = gm({ sets: [{ a: 6, b: 4 }, { a: 6, b: 6 }], currentGame: { a: 3, b: 2 } });
      const c = multiCardsOf([tb], courts, cat, NOW)[0]!;
      expect(c.tiebreak).toBe('tiebreak');
      expect(c.liveGame).toEqual({ a: '3', b: '2' });
      const stb = gm({ sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 0, b: 0 }], currentSetIndex: 2, currentGame: { a: 9, b: 8 } });
      expect(multiCardsOf([stb], courts, cat, NOW)[0]?.tiebreak).toBe('super');
    });
  });
});
