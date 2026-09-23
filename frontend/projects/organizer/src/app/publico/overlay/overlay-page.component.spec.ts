import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { OverlayLiveGateway, type OverlayTeam } from './overlay-live.gateway';
import { OverlayPageComponent } from './overlay-page.component';

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: 'Semifinal',
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'in_progress',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [
      { a: 21, b: 15 },
      { a: 14, b: 11 },
    ],
    courtId: 'q2',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'knockout',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: 1,
    servingTeamId: 'ta',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const TOURNAMENT = {
  id: 't1',
  name: 'Copa VH',
  categories: [{ id: 'cat1', name: 'Feminina B' }],
  courts: [{ id: 'q2', name: 'Quadra 2' }],
} as unknown as OrganizerTournament;

/** Dublê do gateway: a tela não abre Firestore no spec. */
class FakeGateway {
  readonly match = signal<TournamentMatch | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly teams = signal<ReadonlyMap<string, OverlayTeam>>(new Map<string, OverlayTeam>());
  readonly totalRounds = signal(0);
  readonly categoryMatches = signal<readonly TournamentMatch[]>([]);
  readonly started: string[] = [];
  stopped = 0;

  start(matchId: string): () => void {
    this.started.push(matchId);
    return () => {
      this.stopped++;
    };
  }
}

async function mount(inputs: Record<string, unknown>) {
  const fake = new FakeGateway();
  TestBed.overrideComponent(OverlayPageComponent, {
    set: { providers: [{ provide: OverlayLiveGateway, useValue: fake }] },
  });
  const fixture = TestBed.createComponent(OverlayPageComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, fake };
}

describe('OverlayPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('assina a partida que veio na rota', async () => {
    const { fake } = await mount({ matchId: 'm1' });

    expect(fake.started).toEqual(['m1']);
  });

  it('pinta o placar do set corrente quando o snapshot chega', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.teams.set(
      new Map<string, OverlayTeam>([
        ['ta', { label: 'Ana / Bia', players: ['Ana', 'Bia'] }],
        ['tb', { label: 'Carla / Dani', players: ['Carla', 'Dani'] }],
      ]),
    );
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ana / Bia');
    expect(text).toContain('14');
    expect(text).toContain('11');
  });

  it('monta a faixa com o nome do torneio, da categoria e da quadra', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.tournament.set(TOURNAMENT);
    await fixture.whenStable();

    // `court` veio vazio no doc — o nome sai do `courtId` pelas quadras do torneio.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Copa VH · Feminina B · Semifinal · Quadra 2',
    );
  });

  it('respeita o canto pedido em ?pos=', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1', pos: 'br' });
    fake.match.set(match({}));
    await fixture.whenStable();
    const overlay = (fixture.nativeElement as HTMLElement).querySelector('.overlay');

    expect(overlay?.getAttribute('data-pos')).toBe('br');
  });

  it('não desenha nada enquanto a partida não chegou', async () => {
    const { fixture } = await mount({ matchId: 'm1' });

    expect((fixture.nativeElement as HTMLElement).querySelector('.overlay')).toBeNull();
  });

  it('desenha a faixa do KOTC, com rodada numerada, categoria e quadra', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.totalRounds.set(7);
    fake.tournament.set(TOURNAMENT);
    fake.teams.set(
      new Map<string, OverlayTeam>([
        ['k', { label: 'Ana / Bia', players: ['Ana', 'Bia'] }],
        ['c', { label: 'Carla / Dani', players: ['Carla', 'Dani'] }],
        ['q', { label: 'Eva / Fabi', players: ['Eva', 'Fabi'] }],
      ]),
    );
    fake.match.set(
      match({
        matchType: 'koc_round',
        teamAId: '',
        teamBId: '',
        sets: [],
        currentSetIndex: null,
        koc: {
          teamIds: ['k', 'c', 'q'],
          kingTeamId: 'k',
          challengerTeamId: 'c',
          queue: ['q'],
          points: { k: 7, c: 4, q: 2 },
          rallies: 0,
          servingTeamId: 'c',
          clock: { endsAtMs: Date.now() + 836_000, durationSec: 900, pausedAtMs: null },
          standings: [],
          qualifiersPerRound: 2,
          teamsPerCourt: 4,
          roundsPerBracket: 1,
          configuredDurationSec: 900,
          rallySeq: 0,
          rallyLog: [],
          roundLabel: 3,
          qualifierSlots: [],
        },
      }),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(host.querySelector('og-overlay-koc-bar')).not.toBeNull();
    expect(host.querySelectorAll('.block').length).toBe(3);
    expect(text).toContain('Classificatória · Rodada 3/7');
    expect(text).toContain('Feminina B');
    expect(text).toContain('Quadra 2');
    expect(text).toContain('Ana');
  });

  it('rodada KOTC encerrada troca a faixa pela classificação da rodada', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set(TOURNAMENT);
    fake.teams.set(
      new Map<string, OverlayTeam>([
        ['k', { label: 'Ana / Bia', players: ['Ana', 'Bia'] }],
        ['c', { label: 'Carla / Dani', players: ['Carla', 'Dani'] }],
        ['q', { label: 'Eva / Fabi', players: ['Eva', 'Fabi'] }],
      ]),
    );
    const encerrada = match({
      status: 'completed',
      matchType: 'koc_round',
      teamAId: '',
      teamBId: '',
      sets: [],
      currentSetIndex: null,
      koc: {
        teamIds: ['k', 'c', 'q'],
        kingTeamId: 'k',
        challengerTeamId: 'c',
        queue: ['q'],
        points: { k: 8, c: 7, q: 2 },
        rallies: 0,
        servingTeamId: '',
        clock: null,
        standings: [
          { teamId: 'k', place: 1, points: 8, crowns: 3 },
          { teamId: 'c', place: 2, points: 7, crowns: 1 },
          { teamId: 'q', place: 3, points: 2, crowns: 0 },
        ],
        qualifiersPerRound: 2,
        teamsPerCourt: 4,
        roundsPerBracket: 1,
        configuredDurationSec: 900,
        rallySeq: 0,
        rallyLog: [],
        roundLabel: 3,
        qualifierSlots: [],
      },
    });
    fake.categoryMatches.set([encerrada]);
    fake.match.set(encerrada);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(host.querySelector('og-overlay-koc-standings')).not.toBeNull();
    expect(host.querySelector('og-overlay-koc-bar')).toBeNull();
    expect(host.querySelectorAll('.row').length).toBe(3);
    expect(text).toContain('Ana · Bia');
    expect(text).toContain('Eliminada');
  });
});
