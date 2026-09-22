import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { OverlayLiveGateway } from './overlay-live.gateway';
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
  readonly teamLabels = signal<ReadonlyMap<string, string>>(new Map<string, string>());
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
    fake.teamLabels.set(
      new Map([
        ['ta', 'Ana / Bia'],
        ['tb', 'Carla / Dani'],
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
});
