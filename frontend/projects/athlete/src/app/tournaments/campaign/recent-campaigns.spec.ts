import {
  CAMPAIGN_HOME_MAX_CARDS,
  CAMPAIGN_HOME_WINDOW_DAYS,
  recentCampaignsOf,
  type CampaignRegistrationLike,
  type CampaignTournamentLike,
  type RecentCampaignMatch,
} from './recent-campaigns';

const NOW = new Date('2026-04-28T12:00:00Z');
const MINE = new Set(['mine']);

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function reg(partial: Partial<CampaignRegistrationLike> = {}): CampaignRegistrationLike {
  return { tournamentId: 't1', categoryId: 'c1', teamId: 'mine', teamSize: null, ...partial };
}

function tournament(partial: Partial<CampaignTournamentLike> = {}): CampaignTournamentLike {
  return { name: 'Etapa Goiânia', startAt: daysBefore(3), endAt: daysBefore(2), isCancelled: false, ...partial };
}

function m(partial: Partial<RecentCampaignMatch> = {}): RecentCampaignMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    matchType: 'knockout',
    status: 'Completed',
    winnerId: 'mine',
    teamAId: 'mine',
    teamBId: 'them',
    ...partial,
  };
}

function run(over: Partial<Parameters<typeof recentCampaignsOf>[0]> = {}) {
  return recentCampaignsOf({
    registrations: [reg()],
    tournamentsById: new Map([['t1', tournament()]]),
    categoryNameOf: () => 'Masculino B',
    matches: [m()],
    myTeamIds: MINE,
    now: NOW,
    ...over,
  });
}

describe('recentCampaignsOf', () => {
  it('devolve a campanha de um torneio encerrado dentro da janela', () => {
    const [campaign] = run();
    expect(campaign).toBeDefined();
    expect(campaign!.tournamentName).toBe('Etapa Goiânia');
    expect(campaign!.categoryName).toBe('Masculino B');
    expect(campaign!.wins).toBe(1);
    expect(campaign!.losses).toBe(0);
    expect(campaign!.placement).toBe('none');
  });

  it('lê a colocação do mesmo jeito que o card', () => {
    const campaigns = run({ matches: [m({ id: 'f' } as Partial<RecentCampaignMatch>), m({ matchType: 'Final' })] });
    expect(campaigns[0]!.placement).toBe('champion');
  });

  it('some depois da janela de 5 dias', () => {
    const late = new Map([['t1', tournament({ endAt: daysBefore(CAMPAIGN_HOME_WINDOW_DAYS + 1) })]]);
    expect(run({ tournamentsById: late })).toEqual([]);
  });

  it('aparece no último dia da janela', () => {
    const edge = new Map([['t1', tournament({ endAt: daysBefore(CAMPAIGN_HOME_WINDOW_DAYS) })]]);
    expect(run({ tournamentsById: edge }).length).toBe(1);
  });

  // A régua é o FIM do torneio; sem ele, o começo. Sem os dois não dá pra afirmar janela nenhuma.
  it('cai no início quando o torneio não declara fim', () => {
    const noEnd = new Map([['t1', tournament({ endAt: null, startAt: daysBefore(1) })]]);
    expect(run({ tournamentsById: noEnd }).length).toBe(1);
  });

  it('ignora torneio sem data nenhuma', () => {
    const noDates = new Map([['t1', tournament({ startAt: null, endAt: null })]]);
    expect(run({ tournamentsById: noDates })).toEqual([]);
  });

  it('ignora torneio que ainda não terminou', () => {
    const future = new Map([['t1', tournament({ endAt: new Date(NOW.getTime() + 86_400_000) })]]);
    expect(run({ tournamentsById: future })).toEqual([]);
  });

  it('ignora torneio cancelado', () => {
    const canceled = new Map([['t1', tournament({ isCancelled: true })]]);
    expect(run({ tournamentsById: canceled })).toEqual([]);
  });

  it('ignora categoria de equipe', () => {
    expect(run({ registrations: [reg({ teamSize: 4 })] })).toEqual([]);
  });

  it('ignora inscrição sem time definido', () => {
    expect(run({ registrations: [reg({ teamId: null })] })).toEqual([]);
  });

  it('ignora campanha sem nenhuma partida encerrada', () => {
    expect(run({ matches: [m({ status: 'Scheduled', winnerId: null })] })).toEqual([]);
  });

  it('não mistura partidas de outro torneio com o mesmo categoryId', () => {
    const campaigns = run({ matches: [m(), m({ tournamentId: 'outro', matchType: 'Final' })] });
    expect(campaigns[0]!.wins).toBe(1);
    expect(campaigns[0]!.placement).toBe('none');
  });

  it('conta derrotas', () => {
    const campaigns = run({ matches: [m(), m({ winnerId: 'them' })] });
    expect(campaigns[0]!.wins).toBe(1);
    expect(campaigns[0]!.losses).toBe(1);
  });

  it('devolve um card por categoria, da mais recente para a mais antiga', () => {
    const campaigns = recentCampaignsOf({
      registrations: [reg({ categoryId: 'c1' }), reg({ tournamentId: 't2', categoryId: 'c2' })],
      tournamentsById: new Map([
        ['t1', tournament({ name: 'Antigo', endAt: daysBefore(4) })],
        ['t2', tournament({ name: 'Recente', endAt: daysBefore(1) })],
      ]),
      categoryNameOf: (_t, c) => c.toUpperCase(),
      matches: [m(), m({ tournamentId: 't2', categoryId: 'c2' })],
      myTeamIds: MINE,
      now: NOW,
    });
    expect(campaigns.map((c) => c.tournamentName)).toEqual(['Recente', 'Antigo']);
  });

  it('respeita o teto de cards da home', () => {
    const registrations = Array.from({ length: 4 }, (_, i) => reg({ categoryId: `c${i}` }));
    const matches = registrations.map((r) => m({ categoryId: r.categoryId }));
    expect(run({ registrations, matches }).length).toBe(CAMPAIGN_HOME_MAX_CARDS);
  });
});
