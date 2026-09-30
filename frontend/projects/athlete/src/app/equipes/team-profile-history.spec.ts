import type { ArenaMatch, ArenaTeam } from '../data/teams-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../data/tournaments-repository';
import { duoNameOf } from '../profile/public-profile-activity';
import { buildTeamMatchResult, buildTeamTournamentRows } from './team-profile-history';

const NOW = new Date(2026, 8, 30, 12, 0);

function makeMatch(overrides: Partial<ArenaMatch> = {}): ArenaMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat-b',
    matchType: 'knockout',
    status: 'completed',
    winnerId: 'mine',
    teamAId: 'mine',
    teamBId: 'rival',
    teamADescription: '1º Grupo A',
    teamBDescription: 'Vencedor Jogo #5',
    resultA: null,
    resultB: null,
    sets: [],
    scheduleTime: null,
    matchEndedAt: new Date(2026, 7, 10),
    courtName: null,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<ArenaTeam> = {}): ArenaTeam {
  return {
    id: 'rival',
    player1Id: 'u1',
    player2Id: 'u2',
    teamName: null,
    gender: null,
    teamSize: null,
    registrationPaid: true,
    memberUids: [],
    createdAt: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<TournamentCategoryOffer> = {}): TournamentCategoryOffer {
  return {
    id: 'cat-b',
    categoryName: 'Masculino B',
    ...overrides,
  } as TournamentCategoryOffer;
}

function makeTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Copa Verão',
    city: 'Goiânia',
    location: 'Arena Sol',
    startAt: new Date(2026, 7, 10),
    endAt: new Date(2026, 7, 11),
    capacity: 32,
    enrolledCount: 10,
    liveMatchesNow: 0,
    rawStatus: 'completed',
    isCancelled: false,
    isDraftOrCancelled: false,
    categories: [makeCategory()],
    ...overrides,
  } as TournamentSummary;
}

function tournamentsOf(...list: TournamentSummary[]): Map<string, TournamentSummary> {
  return new Map(list.map((t) => [t.id, t]));
}

describe('buildTeamMatchResult', () => {
  const names = new Map([['t1', 'Copa Verão']]);

  it('mostra a equipe adversária, não o apelido da vaga na chave', () => {
    const teams = new Map([['rival', makeTeam()]]);
    const profiles = new Map([
      ['u1', { displayName: 'Ana Ribeiro' }],
      ['u2', { displayName: 'Beto Lima' }],
    ]) as unknown as Parameters<typeof duoNameOf>[2];
    const row = buildTeamMatchResult(makeMatch(), 'mine', names, (id, fallback) => duoNameOf(id, teams, profiles, fallback));
    expect(row.opponent).toBe('Ana / Beto');
  });

  it('resolve o lado A quando a equipe é o time B', () => {
    const seen: [string, string | null][] = [];
    const row = buildTeamMatchResult(makeMatch({ teamAId: 'rival', teamBId: 'mine', winnerId: 'rival' }), 'mine', names, (id, fallback) => {
      seen.push([id, fallback]);
      return 'Rivais';
    });
    expect(seen).toEqual([['rival', '1º Grupo A']]);
    expect(row.opponent).toBe('Rivais');
    expect(row.result).toBe('D');
  });

  it('só cai no apelido quando a equipe adversária não existe mais', () => {
    const row = buildTeamMatchResult(makeMatch(), 'mine', names, (id, fallback) => duoNameOf(id, new Map(), new Map(), fallback));
    expect(row.opponent).toBe('Vencedor Jogo #5');
  });

  it('mostra o placar em sets na perspectiva da equipe, mesmo quando ela é o lado B', () => {
    const match = makeMatch({ teamAId: 'rival', teamBId: 'mine', winnerId: 'mine', sets: [{ a: 18, b: 21 }, { a: 15, b: 21 }] });
    const row = buildTeamMatchResult(match, 'mine', names, () => 'Rivais');
    expect(row.result).toBe('V');
    expect(row.score).toBe('2–0');
  });

  it('usa o nome da equipe nomeada (trio+) quando existe', () => {
    const teams = new Map([['rival', makeTeam({ teamName: 'Areia Quente' })]]);
    const row = buildTeamMatchResult(makeMatch(), 'mine', names, (id, fallback) => duoNameOf(id, teams, new Map(), fallback));
    expect(row.opponent).toBe('Areia Quente');
    expect(row.contextLabel).toBe('Copa Verão · Mata-mata');
  });
});

describe('buildTeamTournamentRows', () => {
  it('une inscrições confirmadas e torneios onde a equipe jogou, sem repetir', () => {
    const rows = buildTeamTournamentRows({
      teamId: 'mine',
      registrations: [
        { tournamentId: 't1', categoryId: 'cat-b' },
        { tournamentId: 't2', categoryId: 'cat-b' },
      ],
      matches: [makeMatch({ id: 'a' }), makeMatch({ id: 'b', winnerId: 'rival' })],
      tournaments: tournamentsOf(
        makeTournament(),
        makeTournament({ id: 't2', name: 'Open Primavera', startAt: new Date(2026, 9, 20), endAt: new Date(2026, 9, 21), rawStatus: 'open' }),
      ),
      now: NOW,
    });

    expect(rows.map((r) => r.id)).toEqual(['t2', 't1']);
    expect(rows[0]).toEqual(
      jasmine.objectContaining({ name: 'Open Primavera', status: 'upcoming', badge: 'Inscrita', recordLabel: null }),
    );
    expect(rows[1]).toEqual(
      jasmine.objectContaining({ contextLabel: 'Masculino B · Goiânia · 10 ago 2026', status: 'ended', badge: '1V · 1D', recordLabel: null }),
    );
  });

  it('marca o título e mantém a campanha ao lado do selo', () => {
    const rows = buildTeamTournamentRows({
      teamId: 'mine',
      registrations: [],
      matches: [makeMatch({ id: 'sf' }), makeMatch({ id: 'f', matchType: 'Final' })],
      tournaments: tournamentsOf(makeTournament()),
      now: NOW,
    });
    expect(rows[0]).toEqual(jasmine.objectContaining({ status: 'title', badge: 'Campeã', recordLabel: '2V · 0D' }));
  });

  it('acha a categoria pela partida quando a inscrição não está mais lá', () => {
    const rows = buildTeamTournamentRows({
      teamId: 'mine',
      registrations: [],
      matches: [makeMatch({ categoryId: 'cat-b' })],
      tournaments: tournamentsOf(makeTournament()),
      now: NOW,
    });
    expect(rows[0].contextLabel).toContain('Masculino B');
  });

  it('mostra "Encerrado" em torneio acabado sem partida decidida', () => {
    const rows = buildTeamTournamentRows({
      teamId: 'mine',
      registrations: [{ tournamentId: 't1', categoryId: 'cat-b' }],
      matches: [],
      tournaments: tournamentsOf(makeTournament()),
      now: NOW,
    });
    expect(rows[0].badge).toBe('Encerrado');
  });

  it('marca "Ao vivo" com a campanha parcial', () => {
    const rows = buildTeamTournamentRows({
      teamId: 'mine',
      registrations: [{ tournamentId: 't1', categoryId: 'cat-b' }],
      matches: [makeMatch(), makeMatch({ id: 'next', status: 'scheduled', winnerId: null })],
      tournaments: tournamentsOf(makeTournament({ rawStatus: 'live', startAt: NOW, endAt: new Date(2026, 8, 30, 22) })),
      now: NOW,
    });
    expect(rows[0]).toEqual(jasmine.objectContaining({ status: 'live', badge: 'Ao vivo', recordLabel: '1V · 0D' }));
  });

  it('esconde torneio cancelado/rascunho onde a equipe não jogou, e torneio que não existe mais', () => {
    const rows = buildTeamTournamentRows({
      teamId: 'mine',
      registrations: [
        { tournamentId: 'cancelado', categoryId: 'cat-b' },
        { tournamentId: 'sumiu', categoryId: 'cat-b' },
      ],
      matches: [],
      tournaments: tournamentsOf(makeTournament({ id: 'cancelado', isCancelled: true, isDraftOrCancelled: true, rawStatus: 'ended' })),
      now: NOW,
    });
    expect(rows).toEqual([]);
  });
});
