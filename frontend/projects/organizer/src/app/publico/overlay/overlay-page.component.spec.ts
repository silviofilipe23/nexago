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
  readonly startedCourts: string[] = [];
  stopped = 0;

  start(matchId: string): () => void {
    this.started.push(matchId);
    return () => {
      this.stopped++;
    };
  }

  startCourt(tournamentId: string, courtId: string): () => void {
    this.startedCourts.push(`${tournamentId}/${courtId}`);
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

function rodadaEncerrada(): TournamentMatch {
  return match({
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
      roundLabel: 1,
      qualifierSlots: [],
      batteryLabel: 1,
      phases: null,
      maxTeamsPerRound: 5,
    },
  });
}

/** Monta a página já no fim de rodada, que é quando há duas telas pra alternar. */
async function noFimDaRodada(inputs: Record<string, unknown> = {}) {
  const montado = await mount({ matchId: 'm1', ...inputs });
  const encerrada = rodadaEncerrada();
  montado.fake.tournament.set(TOURNAMENT);
  montado.fake.categoryMatches.set([encerrada]);
  montado.fake.match.set(encerrada);
  await montado.fixture.whenStable();
  return montado;
}

function telaAtual(fixture: { nativeElement: unknown }): string {
  const host = fixture.nativeElement as HTMLElement;
  if (host.querySelector('og-overlay-koc-standings')) return 'resultado';
  if (host.querySelector('og-overlay-koc-qualified')) return 'classificadas';
  return 'nenhuma';
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
        ['ta', { label: 'Ana / Bia', players: ['Ana', 'Bia'], photos: [null, null] }],
        ['tb', { label: 'Carla / Dani', players: ['Carla', 'Dani'], photos: [null, null] }],
      ]),
    );
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ana');
    expect(text).toContain('Bia');
    expect(text).toContain('14');
    expect(text).toContain('11');
  });

  it('monta a faixa com categoria, fase e quadra', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.tournament.set(TOURNAMENT);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // `court` veio vazio no doc — o nome sai do `courtId` pelas quadras do torneio.
    expect(text).toContain('Feminina B');
    expect(text).toContain('Semifinal');
    expect(text).toContain('Quadra 2');
  });

  it('ancora o placar de duelo embaixo à esquerda', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1', pos: 'br' });
    fake.match.set(match({}));
    await fixture.whenStable();
    const board = (fixture.nativeElement as HTMLElement).querySelector('.board');

    expect(board).not.toBeNull();
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
        ['k', { label: 'Ana / Bia', players: ['Ana', 'Bia'], photos: [null, null] }],
        ['c', { label: 'Carla / Dani', players: ['Carla', 'Dani'], photos: [null, null] }],
        ['q', { label: 'Eva / Fabi', players: ['Eva', 'Fabi'], photos: [null, null] }],
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
          batteryLabel: 1,
          phases: null,
          maxTeamsPerRound: 5,
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
        ['k', { label: 'Ana / Bia', players: ['Ana', 'Bia'], photos: [null, null] }],
        ['c', { label: 'Carla / Dani', players: ['Carla', 'Dani'], photos: [null, null] }],
        ['q', { label: 'Eva / Fabi', players: ['Eva', 'Fabi'], photos: [null, null] }],
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
        batteryLabel: 1,
        phases: null,
        maxTeamsPerRound: 5,
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

  it('alterna entre o resultado da rodada e as classificadas da fase', async () => {
    // Relógio falso: o portal roda zoneless e não carrega zone.js nos testes, então `fakeAsync`
    // não vale aqui — `jasmine.clock` troca o setTimeout de verdade.
    jasmine.clock().install();
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.tournament.set(TOURNAMENT);
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
          roundLabel: 1,
          qualifierSlots: [],
          batteryLabel: 1,
          phases: null,
          maxTeamsPerRound: 5,
        },
      });
      fake.categoryMatches.set([encerrada]);
      fake.match.set(encerrada);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('og-overlay-koc-standings')).not.toBeNull();
      expect(host.querySelector('og-overlay-koc-qualified')).toBeNull();

      jasmine.clock().tick(20_000);
      await fixture.whenStable();

      expect(host.querySelector('og-overlay-koc-qualified')).not.toBeNull();
      expect(host.querySelector('og-overlay-koc-standings')).toBeNull();

      jasmine.clock().tick(15_000);
      await fixture.whenStable();

      expect(host.querySelector('og-overlay-koc-standings')).not.toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('?tela= fixa a visualização e desliga o rodízio', async () => {
    jasmine.clock().install();
    try {
      const { fixture } = await noFimDaRodada({ tela: 'classificadas' });
      expect(telaAtual(fixture)).toBe('classificadas');

      jasmine.clock().tick(60_000);
      await fixture.whenStable();

      expect(telaAtual(fixture)).toBe('classificadas');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('?tela= desconhecido é ignorado e o rodízio segue', async () => {
    jasmine.clock().install();
    try {
      const { fixture } = await noFimDaRodada({ tela: 'qualquer-coisa' });
      expect(telaAtual(fixture)).toBe('resultado');

      jasmine.clock().tick(20_000);
      await fixture.whenStable();

      expect(telaAtual(fixture)).toBe('classificadas');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('clique alterna a visualização e assume o controle do rodízio', async () => {
    jasmine.clock().install();
    try {
      const { fixture } = await noFimDaRodada();
      const host = fixture.nativeElement as HTMLElement;
      expect(telaAtual(fixture)).toBe('resultado');

      host.querySelector<HTMLElement>('.alternar')?.click();
      await fixture.whenStable();
      expect(telaAtual(fixture)).toBe('classificadas');

      // Depois do clique o rodízio não volta a mandar sozinho.
      jasmine.clock().tick(60_000);
      await fixture.whenStable();
      expect(telaAtual(fixture)).toBe('classificadas');

      host.querySelector<HTMLElement>('.alternar')?.click();
      await fixture.whenStable();
      expect(telaAtual(fixture)).toBe('resultado');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('seta do teclado também alterna', async () => {
    const { fixture } = await noFimDaRodada();
    expect(telaAtual(fixture)).toBe('resultado');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();

    expect(telaAtual(fixture)).toBe('classificadas');
  });

  it('não põe camada clicável quando não há o que alternar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.alternar')).toBeNull();
  });

  it('em modo quadra, assina a QUADRA e não uma partida fixa', async () => {
    const { fake } = await mount({ matchId: '', tournamentId: 't1', courtId: 'q2' });

    expect(fake.startedCourts).toEqual(['t1/q2']);
    expect(fake.started).toEqual([]);
  });

  it('com partida na rota, segue assinando só aquela partida', async () => {
    const { fake } = await mount({ matchId: 'm1' });

    expect(fake.started).toEqual(['m1']);
    expect(fake.startedCourts).toEqual([]);
  });

  it('rodada KOTC ainda não iniciada anuncia quem vai entrar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set(TOURNAMENT);
    fake.teams.set(
      new Map<string, OverlayTeam>([
        ['t', { label: 'Sor / Ham', players: ['Sor', 'Ham'], photos: [null, null] }],
        ['a', { label: 'Hölting Nilsson / Berger', players: ['Hölting Nilsson', 'Berger'], photos: [null, null] }],
        ['b', { label: 'Van / Aye', players: ['Van', 'Aye'], photos: [null, null] }],
      ]),
    );
    fake.match.set(
      match({
        status: 'scheduled',
        matchType: 'koc_round',
        teamAId: '',
        teamBId: '',
        sets: [],
        currentSetIndex: null,
        koc: {
          teamIds: ['t', 'a', 'b'],
          kingTeamId: '',
          challengerTeamId: '',
          queue: [],
          points: {},
          rallies: 0,
          servingTeamId: '',
          clock: null,
          standings: [],
          qualifiersPerRound: 1,
          teamsPerCourt: 4,
          roundsPerBracket: 2,
          configuredDurationSec: 900,
          rallySeq: 0,
          rallyLog: [],
          roundLabel: 3,
          qualifierSlots: [],
          batteryLabel: 1,
          phases: null,
          maxTeamsPerRound: 5,
        },
      }),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(host.querySelector('og-overlay-koc-preround')).not.toBeNull();
    expect(host.querySelector('og-overlay-koc-bar')).toBeNull();
    expect(text).toContain('Próximos');
    expect(text).toContain('Hölting Nilsson · Berger');
    expect(text).toContain('Sor · Ham');
    // Sem bateria, o overlay continua numerando pela rodada — como sempre foi.
    expect(text).toContain('Rodada 3');
  });

  it('com mais de uma bateria, o overlay do OBS diz a chave em vez da rodada global', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set(TOURNAMENT);
    fake.teams.set(
      new Map<string, OverlayTeam>([
        ['t', { label: 'Sor / Ham', players: ['Sor', 'Ham'], photos: [null, null] }],
        ['a', { label: 'Hölting Nilsson / Berger', players: ['Hölting Nilsson', 'Berger'], photos: [null, null] }],
        ['b', { label: 'Van / Aye', players: ['Van', 'Aye'], photos: [null, null] }],
      ]),
    );
    fake.match.set(
      match({
        status: 'scheduled',
        matchType: 'koc_round',
        teamAId: '',
        teamBId: '',
        sets: [],
        currentSetIndex: null,
        koc: {
          teamIds: ['t', 'a', 'b'],
          kingTeamId: '',
          challengerTeamId: '',
          queue: [],
          points: {},
          rallies: 0,
          servingTeamId: '',
          clock: null,
          standings: [],
          qualifiersPerRound: 1,
          teamsPerCourt: 4,
          roundsPerBracket: 2,
          configuredDurationSec: 900,
          rallySeq: 0,
          rallyLog: [],
          roundLabel: 9,
          qualifierSlots: [],
          batteryLabel: 3,
          poolId: 'C4',
          phases: null,
          maxTeamsPerRound: 5,
        },
      }),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Chave 4');
    expect(text).toContain('Bateria 3');
    expect(text).not.toContain('Rodada 9');
  });

  it('final encerrada vira a tela de campeões, à frente da classificação', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set(TOURNAMENT);
    fake.teams.set(
      new Map<string, OverlayTeam>([
        ['ta', { label: 'Ana / Bia', players: ['Ana', 'Bia'], photos: [null, null] }],
        ['tb', { label: 'Carla / Dani', players: ['Carla', 'Dani'], photos: [null, null] }],
      ]),
    );
    fake.match.set(
      match({
        status: 'completed',
        matchType: 'Final',
        winnerSide: 1,
        sets: [
          { a: 21, b: 18 },
          { a: 19, b: 21 },
          { a: 15, b: 12 },
        ],
      }),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const text = (host.textContent ?? '').replace(/\s+/g, ' ');

    expect(host.querySelector('og-overlay-final')).not.toBeNull();
    expect(host.querySelector('og-overlay-scoreboard')).toBeNull();
    expect(text).toContain('CAMPEÕES');
    expect(text).toContain('Ana');
    expect(text).toContain('Copa VH');
    expect(text).toContain('Carla & Dani');
  });

  it('final sem vencedor declarado não coroa ninguém e também não mostra placar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({ status: 'completed', matchType: 'Final', winnerSide: null }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-final')).toBeNull();
    expect(host.querySelector('og-overlay-scoreboard')).toBeNull();
  });
});
