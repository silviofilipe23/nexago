import type { TournamentMatch } from '../data/matches-repository';
import type { MatchFinishMemory } from './telao-finished';
import { CHAMPIONS_SHOWCASE_MS, finalKindOf, finalShowcaseOf, hasOtherLiveCourts, liveSetHeadlineOf, pointAlertOf } from './telao-final-mode';

const NOW = Date.UTC(2026, 7, 4, 18, 0, 0);

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'open',
    round: null,
    team1Label: 'A',
    team2Label: 'B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'in_progress',
    teamAId: 'tA',
    teamBId: 'tB',
    sets: [],
    courtId: 'Q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'Final',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const COURTS = ['Q1', 'Q2', 'Q3'];

function memory(entries: Array<[string, number]>): ReadonlyMap<string, MatchFinishMemory> {
  return new Map(entries.map(([id, at]) => [id, { status: 'completed' as const, endedSeenAtMs: at }]));
}

describe('telao-final-mode', () => {
  describe('finalKindOf', () => {
    it('reconhece os tipos que o backend grava', () => {
      expect(finalKindOf('Final')).toBe('final');
      expect(finalKindOf('Grand Final')).toBe('final');
      expect(finalKindOf('grand_final')).toBe('final');
      expect(finalKindOf('Third Place')).toBe('third-place');
      expect(finalKindOf('third_place')).toBe('third-place');
    });

    it('ignora fases comuns', () => {
      expect(finalKindOf('knockout')).toBeNull();
      expect(finalKindOf('WB')).toBeNull();
      expect(finalKindOf('group')).toBeNull();
      expect(finalKindOf('')).toBeNull();
    });
  });

  describe('finalShowcaseOf', () => {
    it('final ao vivo entra em destaque', () => {
      const m = match({ id: 'final' });
      expect(finalShowcaseOf([m], COURTS, NOW, new Map())).toEqual({ match: m, kind: 'final', state: 'live' });
    });

    it('final vence a disputa de 3º lugar quando as duas rolam juntas', () => {
      const terceiro = match({ id: 't3', matchType: 'Third Place', courtId: 'Q2' });
      const final = match({ id: 'final', matchType: 'Final' });
      expect(finalShowcaseOf([terceiro, final], COURTS, NOW, new Map())?.match.id).toBe('final');
    });

    it('3º lugar sozinho entra com o kind bronze', () => {
      const terceiro = match({ id: 't3', matchType: 'Third Place' });
      expect(finalShowcaseOf([terceiro], COURTS, NOW, new Map())).toEqual({ match: terceiro, kind: 'third-place', state: 'live' });
    });

    it('partida comum ao vivo não ativa o modo', () => {
      expect(finalShowcaseOf([match({ matchType: 'knockout' })], COURTS, NOW, new Map())).toBeNull();
    });

    it('quadra fora da seleção do telão não ativa o modo', () => {
      expect(finalShowcaseOf([match({ courtId: 'Q9' })], COURTS, NOW, new Map())).toBeNull();
    });

    it('final encerrada vira tela de campeões por 90 s', () => {
      const m = match({ id: 'final', status: 'completed', winnerSide: 1 });
      const mem = memory([['final', NOW - 60_000]]);
      expect(finalShowcaseOf([m], COURTS, NOW, mem)).toEqual({ match: m, kind: 'final', state: 'champions' });
    });

    it('campeões expira depois da janela', () => {
      const m = match({ id: 'final', status: 'completed', winnerSide: 1 });
      const mem = memory([['final', NOW - CHAMPIONS_SHOWCASE_MS - 1]]);
      expect(finalShowcaseOf([m], COURTS, NOW, mem)).toBeNull();
    });

    it('final encerrada sem fim observado (torneio antigo) não celebra', () => {
      const m = match({ id: 'final', status: 'completed', winnerSide: 1 });
      expect(finalShowcaseOf([m], COURTS, NOW, new Map())).toBeNull();
    });

    it('final ao vivo tem prioridade sobre campeões de outra final', () => {
      const encerrada = match({ id: 'antiga', status: 'completed', winnerSide: 1, courtId: 'Q2' });
      const aoVivo = match({ id: 'agora', matchType: 'Grand Final' });
      const mem = memory([['antiga', NOW - 10_000]]);
      expect(finalShowcaseOf([encerrada, aoVivo], COURTS, NOW, mem)?.match.id).toBe('agora');
    });
  });

  describe('hasOtherLiveCourts', () => {
    it('detecta outra quadra jogando ao mesmo tempo', () => {
      const final = match({ id: 'final', courtId: 'Q1' });
      const outra = match({ id: 'outra', courtId: 'Q2' });
      expect(hasOtherLiveCourts([final, outra], COURTS, final)).toBe(true);
    });

    it('ignora a própria quadra da final e quadras fora da seleção', () => {
      const final = match({ id: 'final', courtId: 'Q1' });
      const mesmaQuadra = match({ id: 'outra', courtId: 'Q1' });
      const foraDoTelao = match({ id: 'fora', courtId: 'Q9' });
      expect(hasOtherLiveCourts([final, mesmaQuadra, foraDoTelao], COURTS, final)).toBe(false);
    });

    it('quadra com jogo apenas agendado não conta', () => {
      const final = match({ id: 'final', courtId: 'Q1' });
      const agendada = match({ id: 'ag', courtId: 'Q2', status: 'scheduled' });
      expect(hasOtherLiveCourts([final, agendada], COURTS, final)).toBe(false);
    });
  });

  describe('pointAlertOf', () => {
    it('20-18 no set decisivo de MD3: 1 ponto pro título = match point', () => {
      const m = match({ sets: [{ a: 21, b: 15 }, { a: 12, b: 21 }, { a: 14, b: 11 }], currentSetIndex: 2 });
      expect(pointAlertOf(m)).toEqual({ side: 'A', kind: 'match' });
    });

    it('set point quando o ponto fecha o set mas não a partida', () => {
      const m = match({ sets: [{ a: 20, b: 12 }], currentSetIndex: 0 });
      expect(pointAlertOf(m)).toEqual({ side: 'A', kind: 'set' });
    });

    it('quem já tem 1 set e fecha o 2º está em match point', () => {
      const m = match({ sets: [{ a: 21, b: 15 }, { a: 20, b: 12 }], currentSetIndex: 1 });
      expect(pointAlertOf(m)).toEqual({ side: 'A', kind: 'match' });
    });

    it('sem vantagem de 2 não há alerta (20-20)', () => {
      const m = match({ sets: [{ a: 20, b: 20 }], currentSetIndex: 0 });
      expect(pointAlertOf(m)).toBeNull();
    });

    it('21-20 é match point de quem lidera (vence com 22-20)', () => {
      const m = match({ sets: [{ a: 21, b: 15 }, { a: 21, b: 20 }], currentSetIndex: 1 });
      expect(pointAlertOf(m)).toEqual({ side: 'A', kind: 'match' });
    });

    it('placar tranquilo não gera alerta', () => {
      expect(pointAlertOf(match({ sets: [{ a: 10, b: 8 }], currentSetIndex: 0 }))).toBeNull();
    });

    it('fora do ao vivo não gera alerta', () => {
      expect(pointAlertOf(match({ status: 'completed', sets: [{ a: 21, b: 15 }] }))).toBeNull();
    });

    describe('partida de games', () => {
      const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 } as const;
      const games = (o: Partial<TournamentMatch>) => match({ scoringProfile: BT, servingTeamId: 'tA', ...o });

      it('5-4 em 40-15: set point de quem está em 40', () => {
        expect(pointAlertOf(games({ sets: [{ a: 5, b: 4 }], currentSetIndex: 0, currentGame: { a: 3, b: 1 } }))).toEqual({ side: 'A', kind: 'set' });
      });

      it('5-4 em 15-40: o ponto de B fecha só o game, sem alerta', () => {
        expect(pointAlertOf(games({ sets: [{ a: 5, b: 4 }], currentSetIndex: 0, currentGame: { a: 1, b: 3 } }))).toBeNull();
      });

      it('6-6 com tie-break em 6-5: set point', () => {
        expect(pointAlertOf(games({ sets: [{ a: 6, b: 6 }], currentSetIndex: 0, currentGame: { a: 6, b: 5 } }))).toEqual({ side: 'A', kind: 'set' });
      });

      it('1 set a 0 e 5-4 em 40-0: match point', () => {
        expect(pointAlertOf(games({ sets: [{ a: 6, b: 3 }, { a: 5, b: 4 }], currentSetIndex: 1, currentGame: { a: 3, b: 0 } }))).toEqual({ side: 'A', kind: 'match' });
      });

      it('super tie-break em andamento (9-8): match point', () => {
        expect(pointAlertOf(games({ sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 0, b: 0 }], currentSetIndex: 2, currentGame: { a: 9, b: 8 } }))).toEqual({ side: 'A', kind: 'match' });
      });

      it('3º set completo (sem super tie-break), 6-5 e AD: match point', () => {
        const full = { ...BT, decidingSet: 'full' } as const;
        expect(pointAlertOf(games({ scoringProfile: full, sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 6, b: 5 }], currentSetIndex: 2, currentGame: { a: 4, b: 3 } }))).toEqual({ side: 'A', kind: 'match' });
      });

      it('rótulo do set no modo final', () => {
        expect(liveSetHeadlineOf({ setNumber: 2, a: 14, b: 11 }, 1)).toBe('2º set');
        expect(liveSetHeadlineOf({ setNumber: 2, a: 5, b: 4, game: { a: '40', b: '15' }, tiebreak: false }, 1)).toBe('2º set · 5-4');
        expect(liveSetHeadlineOf({ setNumber: 1, a: 6, b: 6, game: { a: '4', b: '2' }, tiebreak: true }, 0)).toBe('1º set · Tie-break');
        expect(liveSetHeadlineOf({ setNumber: 3, a: 0, b: 0, game: { a: '7', b: '5' }, tiebreak: true, superTiebreak: true }, 2)).toBe('Super tie-break');
        expect(liveSetHeadlineOf(null, 2)).toBe('2º set');
      });

      it('meio de set sem game decisivo: sem alerta', () => {
        expect(pointAlertOf(games({ sets: [{ a: 3, b: 2 }], currentSetIndex: 0, currentGame: { a: 3, b: 0 } }))).toBeNull();
      });
    });
  });
});
