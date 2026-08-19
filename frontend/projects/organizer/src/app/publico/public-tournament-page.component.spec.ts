import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../painel/data/tournament-collected';
import type { OrganizerTournament } from '../painel/data/tournament.model';
import { PublicTournamentPageComponent } from './public-tournament-page.component';
import { PublicTournamentStore } from './public-tournament.store';

function tournament(overrides: Partial<OrganizerTournament> = {}): OrganizerTournament {
  return {
    id: 't1',
    name: 'Copa de Verão',
    managerId: 'u1',
    sportLabel: 'Beach tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: 'Goiânia',
    location: 'Arena Areia Nobre',
    categories: [{ id: 'cat1', name: 'Feminina B' }],
    capacity: null,
    leagueId: null,
    courts: [{ id: 'q1', name: '1', order: 0 }],
    courtsCount: 1,
    matchOps: {
      dayStart: '07:00',
      dayEnd: '24:00',
      defaultMatchDurationMin: 40,
      minRestBetweenMatchesMin: 20,
    },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    ...overrides,
  } as OrganizerTournament;
}

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
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

/** Store dublado: os mesmos signals, sem Firestore. */
function fakeStore(
  over: {
    tournament?: OrganizerTournament | null;
    matches?: TournamentMatch[];
    notFound?: boolean;
    error?: boolean;
    teamLabels?: ReadonlyMap<string, string>;
  } = {},
) {
  return {
    tournamentId: signal<string | null>('t1'),
    tournament: signal(over.tournament ?? null),
    matches: signal(over.matches ?? []),
    loading: signal(false),
    notFound: signal(over.notFound ?? false),
    error: signal(over.error ?? false),
    teamLabels: signal(over.teamLabels ?? new Map<string, string>()),
  };
}

async function render(store: ReturnType<typeof fakeStore>) {
  await TestBed.configureTestingModule({
    imports: [PublicTournamentPageComponent],
    providers: [provideZonelessChangeDetection()],
  })
    .overrideComponent(PublicTournamentPageComponent, {
      set: {
        providers: [
          { provide: PublicTournamentStore, useValue: store as unknown as PublicTournamentStore },
        ],
      },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(PublicTournamentPageComponent);
  fixture.componentRef.setInput('tournamentId', 't1');
  await fixture.whenStable();
  return fixture;
}

describe('PublicTournamentPageComponent', () => {
  it('mostra o torneio, a quadra ao vivo e o resultado encerrado', async () => {
    const fixture = await render(
      fakeStore({
        tournament: tournament(),
        matches: [
          match({
            id: 'live',
            status: 'in_progress',
            matchStartedAt: new Date(),
            sets: [{ a: 9, b: 6 }],
          }),
          match({
            id: 'fim',
            status: 'completed',
            team1Label: 'Eva / Fabi',
            team2Label: 'Gabi / Hel',
            matchEndedAt: new Date(),
          }),
        ],
      }),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Copa de Verão');
    expect(text).toContain('Arena Areia Nobre');
    expect(text).toContain('Quadra 1');
    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Eva / Fabi');
  });

  it('troca o rótulo cru do doc pelo nome real da dupla já hidratado', async () => {
    const fixture = await render(
      fakeStore({
        tournament: tournament(),
        matches: [
          match({
            id: 'fim',
            status: 'completed',
            teamAId: 't1',
            teamBId: 't2',
            team1Label: 'Vencedor Jogo #12',
            team2Label: '1º Grupo A',
            matchEndedAt: new Date(),
          }),
        ],
        teamLabels: new Map([
          ['t1', 'Ana / Bia'],
          ['t2', 'Carla / Dani'],
        ]),
      }),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Carla / Dani');
    expect(text).not.toContain('Vencedor Jogo #12');
    expect(text).not.toContain('1º Grupo A');
  });

  it('nunca imprime dado financeiro do torneio', async () => {
    const fixture = await render(
      fakeStore({
        tournament: tournament({
          collected: {
            totalCents: 987600,
            viaAppCents: 987600,
            viaOrganizerCents: 0,
            toVerifyCents: 0,
            estimated: false,
          },
        }),
      }),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('9876');
    expect(text).not.toContain('9.876');
  });

  it('avisa quando o torneio não existe', async () => {
    const fixture = await render(fakeStore({ notFound: true }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Torneio não encontrado');
  });

  it('avisa quando o torneio ainda não tem jogos lançados', async () => {
    const fixture = await render(fakeStore({ tournament: tournament(), matches: [] }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Os jogos aparecem aqui');
  });

  it('avisa erro de leitura quando falha antes do primeiro torneio carregado', async () => {
    const fixture = await render(fakeStore({ error: true, tournament: null }));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Não foi possível carregar agora');
    expect(text).not.toContain('Carregando torneio…');
  });
});
