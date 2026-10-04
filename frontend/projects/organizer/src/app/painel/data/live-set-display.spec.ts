import { closedSetColumns, closedSetTexts, livePointsOf, matchClosedSets, matchLiveCurrentSet, matchSetWins, type LiveScoreFields } from './live-set-display';

/** Casos espelhados de `matchLiveCurrentSet`/`matchSetWins` do portal do atleta
 *  (`projects/athlete/src/app/data/matches-repository.ts`) — o telão tem que mostrar o mesmo
 *  set corrente que o atleta vê, unificando mesa ponto a ponto e lançamento rápido. */
describe('live-set-display', () => {
  function live(partial: Partial<LiveScoreFields>): LiveScoreFields {
    return { status: 'in_progress', sets: [], liveScore: null, currentSetIndex: null, bestOf: 3, ...partial };
  }

  describe('matchLiveCurrentSet', () => {
    it('devolve null fora do ao vivo', () => {
      expect(matchLiveCurrentSet(live({ status: 'scheduled', sets: [{ a: 5, b: 3 }] }))).toBeNull();
      expect(matchLiveCurrentSet(live({ status: 'completed', sets: [{ a: 21, b: 15 }] }))).toBeNull();
    });

    it('mesa ponto a ponto: set corrente dentro de sets[] tem prioridade', () => {
      const m = live({
        sets: [
          { a: 21, b: 15 },
          { a: 14, b: 11 },
        ],
        currentSetIndex: 1,
        liveScore: { setsA: 1, setsB: 0, currentGamesA: 99, currentGamesB: 99 },
      });
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 2, a: 14, b: 11 });
    });

    it('sem currentSetIndex cai no último set aberto do array', () => {
      const m = live({ sets: [{ a: 7, b: 9 }] });
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 1, a: 7, b: 9 });
    });

    it('todos os sets de sets[] fechados → cai no agregado liveScore', () => {
      const m = live({
        sets: [{ a: 21, b: 15 }],
        currentSetIndex: 0,
        liveScore: { setsA: 1, setsB: 0, currentGamesA: 5, currentGamesB: 2 },
      });
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 2, a: 5, b: 2 });
    });

    it('só liveScore (lançamento rápido sem sets[]): numera o set pelo agregado', () => {
      const m = live({ liveScore: { setsA: 1, setsB: 1, currentGamesA: 3, currentGamesB: 6 } });
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 3, a: 3, b: 6 });
    });

    it('sem set aberto e sem liveScore → null (entre sets)', () => {
      expect(matchLiveCurrentSet(live({ sets: [{ a: 21, b: 15 }], currentSetIndex: 0 }))).toBeNull();
    });

    it('tie-break de MD3: 3º set fecha em 15 — 15-13 não é corrente', () => {
      const m = live({
        sets: [
          { a: 21, b: 10 },
          { a: 10, b: 21 },
          { a: 15, b: 13 },
        ],
        currentSetIndex: 2,
      });
      expect(matchLiveCurrentSet(m)).toBeNull();
      const aberto = live({
        sets: [
          { a: 21, b: 10 },
          { a: 10, b: 21 },
          { a: 14, b: 13 },
        ],
        currentSetIndex: 2,
      });
      expect(matchLiveCurrentSet(aberto)).toEqual({ setNumber: 3, a: 14, b: 13 });
    });
  });

  describe('matchClosedSets / matchSetWins', () => {
    it('ao vivo, o set em andamento dentro de sets[] fica fora dos fechados', () => {
      const m = live({
        sets: [
          { a: 21, b: 15 },
          { a: 3, b: 2 },
        ],
        currentSetIndex: 1,
      });
      expect(matchClosedSets(m)).toEqual([{ a: 21, b: 15 }]);
      expect(matchSetWins(m)).toEqual([1, 0]);
    });

    it('encerrada, todo set conta (dados históricos fogem da regra e seguem contando)', () => {
      const m = live({ status: 'completed', sets: [{ a: 15, b: 10 }] });
      expect(matchClosedSets(m)).toEqual([{ a: 15, b: 10 }]);
      expect(matchSetWins(m)).toEqual([1, 0]);
    });

    it('sem sets[], sets ganhos vêm do agregado liveScore', () => {
      const m = live({ liveScore: { setsA: 1, setsB: 0, currentGamesA: 2, currentGamesB: 2 } });
      expect(matchSetWins(m)).toEqual([1, 0]);
    });
  });

  describe('partida de games (perfil carimbado)', () => {
    const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 } as const;
    function games(partial: Partial<LiveScoreFields>): LiveScoreFields {
      return live({ scoringProfile: BT, ...partial });
    }

    it('6-4 fecha o set; o game em andamento vem em 0/15/30/40', () => {
      const m = games({ sets: [{ a: 6, b: 4 }, { a: 2, b: 1 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } });
      expect(matchSetWins(m)).toEqual([1, 0]);
      expect(matchClosedSets(m)).toEqual([{ a: 6, b: 4 }]);
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 2, a: 2, b: 1, game: { a: '40', b: '15' }, tiebreak: false });
    });

    it('5-4 não fecha; vantagem aparece como AD', () => {
      const m = games({ sets: [{ a: 5, b: 4 }], currentSetIndex: 0, currentGame: { a: 4, b: 3 } });
      expect(matchSetWins(m)).toEqual([0, 0]);
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 1, a: 5, b: 4, game: { a: 'AD', b: '40' }, tiebreak: false });
    });

    it('6-6 em tie-break: pontos corridos e tiebreak ligado', () => {
      const m = games({ sets: [{ a: 6, b: 6 }], currentSetIndex: 0, currentGame: { a: 4, b: 2 } });
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 1, a: 6, b: 6, game: { a: '4', b: '2' }, tiebreak: true });
    });

    it('super tie-break fechado conta para o vencedor', () => {
      const m = games({ status: 'completed', sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 1, b: 0, tb: { a: 10, b: 8 } }], currentSetIndex: 2 });
      expect(matchSetWins(m)).toEqual([2, 1]);
    });

    it('partida de pontos não ganha game', () => {
      const m = live({ sets: [{ a: 14, b: 11 }], currentSetIndex: 0, currentGame: { a: 3, b: 1 } });
      expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 1, a: 14, b: 11 });
    });
  });

  describe('exibição dos sets e do número grande', () => {
    const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 } as const;
    const done = (sets: LiveScoreFields['sets'], scoringProfile: LiveScoreFields['scoringProfile'] = BT) => live({ status: 'completed', sets, scoringProfile });

    it('games: tie-break por extenso e super tie-break com os pontos dele', () => {
      const m = done([{ a: 6, b: 4 }, { a: 6, b: 7, tb: { a: 5, b: 7 } }, { a: 1, b: 0, tb: { a: 10, b: 8 } }]);
      expect(closedSetTexts(m)).toEqual(['6-4', '6-7 (5-7)', '10-8']);
      expect(closedSetColumns(m)).toEqual([{ a: 6, b: 4 }, { a: 6, b: 7 }, { a: 10, b: 8 }]);
    });

    it('pontos: igual a hoje', () => {
      const m = done([{ a: 21, b: 15 }, { a: 18, b: 21 }], null);
      expect(closedSetTexts(m)).toEqual(['21-15', '18-21']);
      expect(closedSetColumns(m)).toEqual([{ a: 21, b: 15 }, { a: 18, b: 21 }]);
    });

    it('número grande: ponto do game em games, pontos do set em pontos', () => {
      expect(livePointsOf({ setNumber: 1, a: 5, b: 4, game: { a: 'AD', b: '40' }, tiebreak: false }, 'A')).toBe('AD');
      expect(livePointsOf({ setNumber: 1, a: 14, b: 11 }, 'B')).toBe(11);
    });
  });
});
