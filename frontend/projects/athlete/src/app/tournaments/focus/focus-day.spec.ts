import type { ArenaMatch } from '../../data/teams-repository';
import { focusDayTargetOf, focusMemoKeyOf, isOpenToday } from './focus-day';

function arenaMatch(partial: Partial<ArenaMatch> & Pick<ArenaMatch, 'id'>): ArenaMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    matchType: 'group',
    status: 'scheduled',
    winnerId: null,
    teamAId: 'teamMine',
    teamBId: 'teamOther',
    teamADescription: null,
    teamBDescription: null,
    resultA: null,
    resultB: null,
    sets: [],
    scheduleTime: null,
    matchEndedAt: null,
    courtName: null,
    ...partial,
  };
}

/** 14:00 em São Paulo (UTC-3) no dia 29/08/2026. */
const TODAY = new Date('2026-08-29T17:00:00Z');

describe('focusDayTargetOf', () => {
  it('devolve null quando não há partida hoje', () => {
    const matches = [arenaMatch({ id: 'm1', scheduleTime: new Date('2026-08-30T17:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('escolhe a partida de hoje ainda em aberto', () => {
    const matches = [
      arenaMatch({ id: 'm1', tournamentId: 'tA', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toEqual({ tournamentId: 'tA', matchId: 'm1' });
  });

  it('ignora partida encerrada e cancelada', () => {
    const matches = [
      arenaMatch({ id: 'm1', status: 'completed', scheduleTime: new Date('2026-08-29T12:00:00Z') }),
      arenaMatch({ id: 'm2', status: 'canceled', scheduleTime: new Date('2026-08-29T13:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('mantém a partida em quadra — é quando o Focus mais serve', () => {
    const matches = [
      arenaMatch({ id: 'm1', status: 'in progress', scheduleTime: new Date('2026-08-29T16:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)?.matchId).toBe('m1');
  });

  it('entre dois torneios no mesmo dia, o mais cedo manda', () => {
    const matches = [
      arenaMatch({ id: 'm2', tournamentId: 'tB', scheduleTime: new Date('2026-08-29T19:00:00Z') }),
      arenaMatch({ id: 'm1', tournamentId: 'tA', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)?.tournamentId).toBe('tA');
  });

  it('não confunde o dia pelo fuso: 22h de São Paulo ainda é hoje', () => {
    // 2026-08-30T01:00:00Z = 29/08 às 22:00 em São Paulo.
    const matches = [arenaMatch({ id: 'm1', scheduleTime: new Date('2026-08-30T01:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)?.matchId).toBe('m1');
  });

  it('ignora partida sem torneio', () => {
    const matches = [
      arenaMatch({ id: 'm1', tournamentId: '', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });
});

describe('isOpenToday', () => {
  // `isOpenToday` precisa concordar com `matchIsCompleted`/`matchIsCanceled`
  // (`data/matches-repository.ts`) em vez de reimplementar o próprio critério de status — duas
  // definições de "encerrada"/"cancelada" é a classe de bug que já pegou este branch duas vezes
  // (ver Finding 5 da revisão). Estes casos cobrem exatamente os status que aquelas funções
  // reconhecem, incluindo variação de maiúscula/minúscula e espaço, pra garantir que a leitura
  // vem delas e não de uma cópia local.
  it('partida encerrada não conta como aberta, mesmo com variação de maiúscula/minúscula e espaço', () => {
    const matches = [arenaMatch({ id: 'm1', status: '  Completed  ', scheduleTime: new Date('2026-08-29T15:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('partida cancelada não conta como aberta, mesmo com variação de maiúscula/minúscula', () => {
    const matches = [arenaMatch({ id: 'm1', status: 'CANCELED', scheduleTime: new Date('2026-08-29T15:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('é exportada e utilizável fora de `focusDayTargetOf`', () => {
    const open = arenaMatch({ id: 'm1', status: 'in progress', scheduleTime: new Date('2026-08-29T15:00:00Z') });
    const closed = arenaMatch({ id: 'm2', status: 'completed', scheduleTime: new Date('2026-08-29T15:00:00Z') });
    expect(isOpenToday(open, TODAY)).toBe(true);
    expect(isOpenToday(closed, TODAY)).toBe(false);
  });
});

describe('focusMemoKeyOf', () => {
  it('mesmo uid e mesmo dia geram a mesma chave', () => {
    const uid = 'user123';
    const key1 = focusMemoKeyOf(uid, TODAY);
    const key2 = focusMemoKeyOf(uid, TODAY);
    expect(key1).toBe(key2);
  });

  it('mesmo uid em dias diferentes geram chaves diferentes', () => {
    const uid = 'user123';
    const today = TODAY;
    const tomorrow = new Date('2026-08-30T17:00:00Z');
    const keyToday = focusMemoKeyOf(uid, today);
    const keyTomorrow = focusMemoKeyOf(uid, tomorrow);
    expect(keyToday).not.toBe(keyTomorrow);
  });

  it('uids diferentes no mesmo dia geram chaves diferentes', () => {
    const today = TODAY;
    const keyUser1 = focusMemoKeyOf('user1', today);
    const keyUser2 = focusMemoKeyOf('user2', today);
    expect(keyUser1).not.toBe(keyUser2);
  });

  it('uid vazio gera chave diferente de uid normal', () => {
    const today = TODAY;
    const keyEmpty = focusMemoKeyOf('', today);
    const keyUser = focusMemoKeyOf('user123', today);
    expect(keyEmpty).not.toBe(keyUser);
  });

  it('atravessar a meia-noite de São Paulo gera chave diferente', () => {
    // 29/08 às 23:50 em São Paulo (2026-08-30T02:50:00Z)
    const before = new Date('2026-08-30T02:50:00Z');
    // 30/08 às 00:10 em São Paulo (2026-08-30T03:10:00Z)
    const after = new Date('2026-08-30T03:10:00Z');
    const uid = 'user123';
    const keyBefore = focusMemoKeyOf(uid, before);
    const keyAfter = focusMemoKeyOf(uid, after);
    expect(keyBefore).not.toBe(keyAfter);
  });
});
