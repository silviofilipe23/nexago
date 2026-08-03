import type { TournamentMatch } from '../data/matches-repository';
import { callOf, courtNowOf, courtPageCount, courtPageOf, leadingSideOf, teamShortLabel, upcomingQueue } from './telao-selectors';

const NOW = Date.UTC(2026, 7, 3, 18, 0, 0); // 03/08/2026 18:00 UTC

function at(minFromNow: number): Date {
  return new Date(NOW + minFromNow * 60_000);
}

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: Math.random().toString(36).slice(2),
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'A',
    team2Label: 'B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'Q1',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    matchStartedAt: null,
    ...overrides,
  };
}

describe('telao-selectors', () => {
  describe('courtNowOf', () => {
    it('partida ao vivo na quadra vence a agendada', () => {
      const liveM = match({ id: 'live', status: 'in_progress' });
      const nextM = match({ id: 'next', scheduledAt: at(30) });
      expect(courtNowOf([nextM, liveM], 'Q1', NOW)).toEqual({ kind: 'live', match: liveM });
    });

    it('duas ao vivo na mesma quadra → a que começou por último (está na areia)', () => {
      const antiga = match({ id: 'antiga', status: 'in_progress', matchStartedAt: at(-60) });
      const atual = match({ id: 'atual', status: 'in_progress', matchStartedAt: at(-10) });
      expect(courtNowOf([antiga, atual], 'Q1', NOW).match?.id).toBe('atual');
    });

    it('sem ao vivo: próxima agendada, incluindo atrasada até 30 min', () => {
      const atrasada = match({ id: 'atrasada', scheduledAt: at(-20) });
      const futura = match({ id: 'futura', scheduledAt: at(40) });
      expect(courtNowOf([futura, atrasada], 'Q1', NOW)).toEqual({ kind: 'next', match: atrasada });
    });

    it('agendada há mais de 30 min não segura a quadra — pula pra próxima', () => {
      const esquecida = match({ id: 'esquecida', scheduledAt: at(-45) });
      const futura = match({ id: 'futura', scheduledAt: at(40) });
      expect(courtNowOf([esquecida, futura], 'Q1', NOW).match?.id).toBe('futura');
    });

    it('quadra sem jogos pendentes fica livre (concluída/cancelada não contam)', () => {
      const done = match({ status: 'completed', scheduledAt: at(10) });
      const canceled = match({ status: 'canceled', scheduledAt: at(20) });
      expect(courtNowOf([done, canceled], 'Q1', NOW)).toEqual({ kind: 'free', match: null });
    });

    it('só olha a quadra pedida', () => {
      const outra = match({ status: 'in_progress', courtId: 'Q2' });
      expect(courtNowOf([outra], 'Q1', NOW).kind).toBe('free');
    });
  });

  describe('upcomingQueue', () => {
    it('ordena por horário, filtra quadras selecionadas e corta no limite', () => {
      const ms = [
        match({ id: 'c', scheduledAt: at(60), courtId: 'Q2' }),
        match({ id: 'a', scheduledAt: at(15), courtId: 'Q1' }),
        match({ id: 'fora', scheduledAt: at(20), courtId: 'Q9' }),
        match({ id: 'b', scheduledAt: at(30), courtId: 'Q1' }),
      ];
      expect(upcomingQueue(ms, ['Q1', 'Q2'], NOW).map((m) => m.id)).toEqual(['a', 'b', 'c']);
      expect(upcomingQueue(ms, ['Q1', 'Q2'], NOW, 2).map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('inclui jogo recém-passado (tolerância 10 min) e exclui mais antigo', () => {
      const ms = [match({ id: 'recente', scheduledAt: at(-5) }), match({ id: 'velho', scheduledAt: at(-15) })];
      expect(upcomingQueue(ms, ['Q1'], NOW).map((m) => m.id)).toEqual(['recente']);
    });

    it('desempata horário igual por matchNumber', () => {
      const ms = [match({ id: 'n2', scheduledAt: at(10), matchNumber: 2 }), match({ id: 'n1', scheduledAt: at(10), matchNumber: 1 })];
      expect(upcomingQueue(ms, ['Q1'], NOW).map((m) => m.id)).toEqual(['n1', 'n2']);
    });
  });

  describe('callOf', () => {
    it('chama o 1º da fila com prazo 5 min antes do horário', () => {
      const m = match({ scheduledAt: at(20) });
      const call = callOf([m]);
      expect(call?.match).toBe(m);
      expect(call?.deadline.getTime()).toBe(at(15).getTime());
    });

    it('fila vazia → sem chamada', () => {
      expect(callOf([])).toBeNull();
    });
  });

  describe('paginação da rotação', () => {
    const courts = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9'];

    it('até 4 quadras: página única', () => {
      expect(courtPageOf(['Q1', 'Q2'], 5)).toEqual(['Q1', 'Q2']);
      expect(courtPageCount(4)).toBe(1);
    });

    it('9 quadras: 3 páginas com wrap-around', () => {
      expect(courtPageCount(9)).toBe(3);
      expect(courtPageOf(courts, 0)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
      expect(courtPageOf(courts, 2)).toEqual(['Q9']);
      expect(courtPageOf(courts, 3)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    });
  });

  describe('leadingSideOf', () => {
    it('sets fechados mandam, mesmo perdendo o set atual', () => {
      const m = match({ status: 'in_progress', sets: [{ a: 21, b: 15 }, { a: 3, b: 9 }], currentSetIndex: 1 });
      expect(leadingSideOf(m)).toBe('A');
    });

    it('empate em sets → pontos do set corrente decidem', () => {
      const m = match({ status: 'in_progress', sets: [{ a: 7, b: 9 }], currentSetIndex: 0 });
      expect(leadingSideOf(m)).toBe('B');
    });

    it('tudo empatado → ninguém na frente', () => {
      const m = match({ status: 'in_progress', sets: [{ a: 9, b: 9 }], currentSetIndex: 0 });
      expect(leadingSideOf(m)).toBeNull();
    });

    it('lançamento rápido: agregado liveScore decide', () => {
      const m = match({ status: 'in_progress', liveScore: { setsA: 0, setsB: 1, currentGamesA: 2, currentGamesB: 2 } });
      expect(leadingSideOf(m)).toBe('B');
    });

    it('fora do ao vivo → null', () => {
      expect(leadingSideOf(match({ status: 'scheduled' }))).toBeNull();
      expect(leadingSideOf(match({ status: 'completed', sets: [{ a: 21, b: 10 }] }))).toBeNull();
    });
  });

  describe('teamShortLabel', () => {
    it('dupla vira primeiro nome de cada um', () => {
      expect(teamShortLabel('Lucas Martins / Paula da Silva')).toBe('Lucas / Paula');
    });

    it('nome custom de equipe passa truncado', () => {
      expect(teamShortLabel('Amigos do Vôlei de Praia Forever')).toBe('Amigos do Vôlei de Pr…');
    });

    it('um jogador só (procurando dupla) fica como está', () => {
      expect(teamShortLabel('Lucas Martins')).toBe('Lucas Martins');
    });
  });
});
