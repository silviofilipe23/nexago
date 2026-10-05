import type { TournamentMatch } from '../../data/matches-repository';
import {
  focusDayTargetOf,
  focusMemoKeyOf,
  tournamentRunsToday,
  type FocusDayRegistration,
  type FocusDayTournament,
} from './focus-day';

/** 14:00 em São Paulo (UTC-3) no dia 29/08/2026. */
const TODAY = new Date('2026-08-29T17:00:00Z');

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'A',
    teamAId: 'teamMine',
    teamBId: 'teamOther',
    teamADescription: null,
    teamBDescription: null,
    status: 'scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: true,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: null,
    currentSetIndex: null,
    ...partial,
  };
}

function tournament(partial: Partial<FocusDayTournament> = {}): FocusDayTournament {
  return {
    startAt: new Date('2026-08-29T13:00:00Z'),
    endAt: new Date('2026-08-29T23:00:00Z'),
    // `bracketsReady` (inscrições encerradas / chaves prontas) de propósito, não `open`: com
    // `open` no dia de abertura o `tournamentListingStatus` já devolve 'live' e a função responde
    // pelo atalho, sem nunca tocar na janela do evento — foi assim que a 1ª versão destes testes
    // passou com a janela trocada por `eventDayOf`. Este status é o estado real e comum do dia do
    // evento, e é o que obriga a janela a decidir.
    rawStatus: 'bracketsReady',
    liveMatchesNow: 0,
    enrolledCount: 10,
    capacity: 32,
    isDraftOrCancelled: false,
    ...partial,
  };
}

function registration(partial: Partial<FocusDayRegistration> = {}): FocusDayRegistration {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    teamId: 'teamMine',
    isPaid: true,
    ...partial,
  };
}

describe('tournamentRunsToday', () => {
  // A armadilha desta função: `eventDayOf` (`tournament-days.ts`) devolve `null` em torneio de um
  // dia só, de propósito — "dia 1 de 1" não é frase que se diga. Usá-la como "o evento roda
  // hoje" deixaria de fora QUASE TODO torneio da base, que é de um dia.
  it('torneio de um dia só, no dia, roda hoje', () => {
    expect(tournamentRunsToday(tournament(), TODAY)).toBe(true);
  });

  // O outro caminho: status ao vivo responde na hora, sem depender da janela — é o que salva o
  // torneio que está rolando mas não declarou as datas.
  it('torneio com partida em quadra roda hoje mesmo sem datas declaradas', () => {
    const t = tournament({ startAt: null, endAt: null, liveMatchesNow: 2 });
    expect(tournamentRunsToday(t, TODAY)).toBe(true);
  });

  it('dia do MEIO de um torneio de três dias também roda hoje', () => {
    const t = tournament({
      startAt: new Date('2026-08-28T13:00:00Z'),
      endAt: new Date('2026-08-30T23:00:00Z'),
    });
    expect(tournamentRunsToday(t, TODAY)).toBe(true);
  });

  it('véspera não roda hoje', () => {
    const t = tournament({
      startAt: new Date('2026-08-30T13:00:00Z'),
      endAt: new Date('2026-08-30T23:00:00Z'),
    });
    expect(tournamentRunsToday(t, TODAY)).toBe(false);
  });

  it('torneio que já acabou não roda hoje', () => {
    const t = tournament({
      startAt: new Date('2026-08-27T13:00:00Z'),
      endAt: new Date('2026-08-28T23:00:00Z'),
    });
    expect(tournamentRunsToday(t, TODAY)).toBe(false);
  });

  it('torneio cancelado não roda hoje, mesmo dentro da janela', () => {
    expect(tournamentRunsToday(tournament({ isDraftOrCancelled: true }), TODAY)).toBe(false);
  });

  it('sem data de início não roda hoje', () => {
    expect(tournamentRunsToday(tournament({ startAt: null, endAt: null }), TODAY)).toBe(false);
  });
});

describe('focusDayTargetOf', () => {
  const tournaments = new Map([['t1', tournament()]]);

  // O caso que motivou a mudança: o atleta chega na arena de manhã, o organizador ainda não
  // gerou a chave, não existe partida nenhuma. Exigir partida do dia — o que a versão anterior
  // fazia — mantinha o Focus fechado justamente na hora em que ele mais serve.
  it('abre no dia do evento mesmo sem NENHUMA partida gerada', () => {
    const target = focusDayTargetOf([registration()], tournaments, new Map(), TODAY);
    expect(target).toEqual({ tournamentId: 't1' });
  });

  it('inscrição não paga não abre o Focus', () => {
    const target = focusDayTargetOf([registration({ isPaid: false })], tournaments, new Map(), TODAY);
    expect(target).toBeNull();
  });

  // Reserva solo sem dupla fechada não tem `teamId`, e sem ele não há como dizer quais partidas
  // são do atleta nem se ele foi eliminado.
  it('inscrição sem equipe formada não abre o Focus', () => {
    const target = focusDayTargetOf([registration({ teamId: null })], tournaments, new Map(), TODAY);
    expect(target).toBeNull();
  });

  it('torneio fora do dia do evento não abre o Focus', () => {
    const outside = new Map([
      ['t1', tournament({ startAt: new Date('2026-09-05T13:00:00Z'), endAt: new Date('2026-09-05T23:00:00Z') })],
    ]);
    expect(focusDayTargetOf([registration()], outside, new Map(), TODAY)).toBeNull();
  });

  it('torneio sem resumo carregado não abre o Focus', () => {
    expect(focusDayTargetOf([registration()], new Map(), new Map(), TODAY)).toBeNull();
  });

  // Eliminado no mata-mata o dia acabou para ele: sequestrar a navegação para uma tela que só
  // mostra a chave dos outros é pior que não abrir.
  it('eliminado no mata-mata não abre o Focus', () => {
    const matches = new Map([
      [
        't1',
        [
          match({
            id: 'm1',
            isGroupMatch: false,
            poolId: '',
            matchType: 'elimination',
            status: 'completed',
            winnerId: 'teamOther',
          }),
        ],
      ],
    ]);
    expect(focusDayTargetOf([registration()], tournaments, matches, TODAY)).toBeNull();
  });

  it('entre dois torneios elegíveis, prefere o que tem partida hoje', () => {
    const regs = [registration({ tournamentId: 'tA' }), registration({ tournamentId: 'tB' })];
    const summaries = new Map([
      ['tA', tournament()],
      ['tB', tournament()],
    ]);
    const matches = new Map([
      ['tB', [match({ id: 'm1', tournamentId: 'tB', scheduleTime: new Date('2026-08-29T18:00:00Z') })]],
    ]);
    expect(focusDayTargetOf(regs, summaries, matches, TODAY)?.tournamentId).toBe('tB');
  });

  // Partida com âncora de OUTRO dia não conta como partida de hoje — mas também não desqualifica
  // o torneio, que segue elegível pelo dia do evento.
  it('partida de outro dia não é preferida, e o torneio segue abrindo', () => {
    const matches = new Map([
      ['t1', [match({ id: 'm1', scheduleTime: new Date('2026-09-03T18:00:00Z') })]],
    ]);
    expect(focusDayTargetOf([registration()], tournaments, matches, TODAY)).toEqual({ tournamentId: 't1' });
  });

  it('sem inscrição nenhuma não abre o Focus', () => {
    expect(focusDayTargetOf([], tournaments, new Map(), TODAY)).toBeNull();
  });
});

describe('focusMemoKeyOf', () => {
  it('mesmo uid e mesmo dia geram a mesma chave', () => {
    const uid = 'user123';
    expect(focusMemoKeyOf(uid, TODAY)).toBe(focusMemoKeyOf(uid, TODAY));
  });

  it('mesmo uid em dias diferentes geram chaves diferentes', () => {
    const uid = 'user123';
    const tomorrow = new Date('2026-08-30T17:00:00Z');
    expect(focusMemoKeyOf(uid, TODAY)).not.toBe(focusMemoKeyOf(uid, tomorrow));
  });

  it('uids diferentes no mesmo dia geram chaves diferentes', () => {
    expect(focusMemoKeyOf('user1', TODAY)).not.toBe(focusMemoKeyOf('user2', TODAY));
  });

  it('uid vazio gera chave diferente de uid normal', () => {
    expect(focusMemoKeyOf('', TODAY)).not.toBe(focusMemoKeyOf('user123', TODAY));
  });

  it('atravessar a meia-noite de São Paulo gera chave diferente', () => {
    // 29/08 às 23:50 em São Paulo (2026-08-30T02:50:00Z)
    const before = new Date('2026-08-30T02:50:00Z');
    // 30/08 às 00:10 em São Paulo (2026-08-30T03:10:00Z)
    const after = new Date('2026-08-30T03:10:00Z');
    expect(focusMemoKeyOf('user123', before)).not.toBe(focusMemoKeyOf('user123', after));
  });
});
