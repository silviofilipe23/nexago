import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { KocRoundState } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { MatchFinishMemory } from '../../painel/telao/telao-finished';
import { TelaoDataService, type TelaoTeamDisplay } from '../../painel/telao/telao-data.service';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { LedPageComponent } from './led-page.component';

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['k', 'c', 'q'],
    kingTeamId: 'k',
    challengerTeamId: 'c',
    queue: ['q'],
    points: { k: 4, c: 14, q: 1 },
    rallies: 0,
    servingTeamId: '',
    clock: { endsAtMs: Date.now() + 163_000, durationSec: 900, pausedAtMs: null },
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 4,
    roundsPerBracket: 2,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 3,
    qualifierSlots: [],
    ...overrides,
  };
}

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra 2',
    status: 'in_progress',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q2',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 3,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: new Date(),
    matchEndedAt: null,
    koc: round(),
    ...overrides,
  };
}

const TOURNAMENT = {
  id: 't1',
  name: 'Etapa Goiânia',
  categories: [{ id: 'cat1', name: 'Masculino B' }],
  courts: [{ id: 'q2', name: 'Quadra 2' }],
} as unknown as OrganizerTournament;

function team(a: string, b: string): TelaoTeamDisplay {
  return {
    label: `${a} / ${b}`,
    short: a,
    sub: null,
    players: [
      { initials: a.slice(0, 2).toUpperCase(), photoUrl: null },
      { initials: b.slice(0, 2).toUpperCase(), photoUrl: null },
    ],
    playerNames: [a, b],
  };
}

class FakeTelao {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(TOURNAMENT);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly teams = signal<ReadonlyMap<string, TelaoTeamDisplay>>(
    new Map([
      ['k', team('Van', 'Aye')],
      ['c', team('Bro', 'Dau')],
      ['q', team('Sor', 'Ham')],
    ]),
  );
  readonly finishMemory = signal<ReadonlyMap<string, MatchFinishMemory>>(new Map());
}

async function mount(inputs: Record<string, unknown> = {}) {
  const fake = new FakeTelao();
  TestBed.overrideComponent(LedPageComponent, {
    set: { providers: [{ provide: TelaoDataService, useValue: fake }] },
  });
  const fixture = TestBed.createComponent(LedPageComponent);
  const all = { tournamentId: 't1', courtId: 'q2', ...inputs };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, fake };
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('LedPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('assina o torneio da rota', async () => {
    const { fake } = await mount();

    expect(fake.tournamentId()).toBe('t1');
  });

  it('mostra a rodada ao vivo que está NAQUELA quadra', async () => {
    const { fixture, fake } = await mount();
    fake.matches.set([match()]);
    await fixture.whenStable();
    const h = host(fixture);

    expect(h.querySelector('og-led-round')).not.toBeNull();
    expect(h.textContent).toContain('Van');
    expect(h.textContent).toContain('Masculino B');
  });

  it('ignora rodada de outra quadra', async () => {
    const { fixture, fake } = await mount();
    fake.matches.set([match({ courtId: 'q9' })]);
    await fixture.whenStable();

    expect(host(fixture).querySelector('og-led-round')).toBeNull();
  });

  it('rodada encerrada vira a classificação da rodada', async () => {
    const { fixture, fake } = await mount();
    const encerrada = match({
      status: 'completed',
      koc: round({
        standings: [
          { teamId: 'k', place: 1, points: 17, crowns: 3 },
          { teamId: 'c', place: 2, points: 14, crowns: 0 },
          { teamId: 'q', place: 3, points: 4, crowns: 0 },
        ],
      }),
    });
    fake.matches.set([encerrada]);
    fake.finishMemory.set(
      new Map<string, MatchFinishMemory>([
        ['m1', { status: 'completed', endedSeenAtMs: Date.now() }],
      ]),
    );
    await fixture.whenStable();
    const h = host(fixture);

    expect(h.querySelector('og-led-standings')).not.toBeNull();
    expect(h.querySelector('og-led-round')).toBeNull();
    expect(h.textContent).toContain('encerrada');
    expect(h.textContent).toContain('Classificada');
  });
});
