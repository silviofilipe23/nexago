import type { TournamentMatch } from '../painel/data/matches-repository';
import type { OrganizerTournamentCategory, OrganizerTournamentCourt } from '../painel/data/tournament.model';
import { categoryNameOf, publicCourtRows, publicUpcomingRows, recentResults } from './public-selectors';

const NOW = Date.UTC(2026, 7, 18, 18, 0, 0); // 18/08/2026 18:00 UTC

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
    courtId: 'q1',
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
    matchEndedAt: null,
    ...overrides,
  };
}

const COURTS: OrganizerTournamentCourt[] = [
  { id: 'q1', name: '1', order: 0 },
  { id: 'q2', name: 'Central', order: 1 },
];

const CATEGORIES = [{ id: 'cat1', name: 'Feminina B' }] as OrganizerTournamentCategory[];

describe('publicCourtRows', () => {
  it('marca a quadra com partida ao vivo e formata o nome', () => {
    const rows = publicCourtRows([match({ courtId: 'q1', status: 'in_progress', matchStartedAt: at(-10) })], COURTS, CATEGORIES, NOW);
    expect(rows[0].name).toBe('Quadra 1');
    expect(rows[0].kind).toBe('live');
    expect(rows[0].categoryLabel).toBe('Feminina B');
  });

  it('dá quadra livre quando não há nada perto do horário', () => {
    const rows = publicCourtRows([], COURTS, CATEGORIES, NOW);
    expect(rows.map((r) => r.kind)).toEqual(['free', 'free']);
    expect(rows[1].name).toBe('Quadra Central');
  });

  it('mostra a próxima agendada da quadra', () => {
    const rows = publicCourtRows([match({ courtId: 'q2', scheduledAt: at(20) })], COURTS, CATEGORIES, NOW);
    expect(rows[1].kind).toBe('next');
  });
});

describe('publicUpcomingRows', () => {
  it('ordena por horário e formata hora, quadra e categoria', () => {
    const rows = publicUpcomingRows(
      [
        match({ id: 'depois', courtId: 'q1', court: '1', scheduledAt: at(60) }),
        match({ id: 'antes', courtId: 'q2', court: 'Central', scheduledAt: at(15), team1Label: 'Ana / Bia', team2Label: 'Carla / Dani' }),
      ],
      COURTS,
      CATEGORIES,
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['antes', 'depois']);
    expect(rows[0].court).toBe('Quadra Central');
    expect(rows[0].teams).toBe('Ana / Bia vs Carla / Dani');
    expect(rows[0].meta).toBe('Feminina B');
  });

  it('respeita o limite', () => {
    const many = [1, 2, 3, 4].map((i) => match({ courtId: 'q1', scheduledAt: at(i * 10) }));
    expect(publicUpcomingRows(many, COURTS, CATEGORIES, NOW, 2).length).toBe(2);
  });
});

describe('recentResults', () => {
  it('devolve só encerradas, mais recente primeiro', () => {
    const rows = recentResults([
      match({ id: 'velha', status: 'completed', matchEndedAt: at(-120) }),
      match({ id: 'nova', status: 'completed', matchEndedAt: at(-5) }),
      match({ id: 'jogando', status: 'in_progress' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['nova', 'velha']);
  });

  it('cai no horário agendado quando o fim não foi gravado (lançamento rápido)', () => {
    const rows = recentResults([
      match({ id: 'sem-fim-cedo', status: 'completed', scheduledAt: at(-200) }),
      match({ id: 'sem-fim-tarde', status: 'completed', scheduledAt: at(-30) }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['sem-fim-tarde', 'sem-fim-cedo']);
  });

  it('desempata pelo número do jogo quando nada tem data', () => {
    const rows = recentResults([
      match({ id: 'jogo-2', status: 'completed', matchNumber: 2 }),
      match({ id: 'jogo-9', status: 'completed', matchNumber: 9 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['jogo-9', 'jogo-2']);
  });

  it('respeita o limite', () => {
    const many = [1, 2, 3, 4, 5].map((i) => match({ status: 'completed', matchNumber: i }));
    expect(recentResults(many, 3).length).toBe(3);
  });
});

describe('categoryNameOf', () => {
  it('devolve string vazia pra categoria desconhecida ou nula', () => {
    expect(categoryNameOf(CATEGORIES, null)).toBe('');
    expect(categoryNameOf(CATEGORIES, 'nao-existe')).toBe('');
  });
});
