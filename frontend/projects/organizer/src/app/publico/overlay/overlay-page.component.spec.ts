import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl, type BroadcastInterview, interviewWithDefaults } from '../../painel/data/broadcast-control';
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
/** `implements Pick<…>` amarra o dublê ao gateway REAL: membro renomeado lá quebra aqui. */
class FakeGateway
  implements
    Pick<
      OverlayLiveGateway,
      | 'match'
      | 'tournament'
      | 'teams'
      | 'totalRounds'
      | 'categoryMatches'
      | 'control'
      | 'controlReady'
      | 'tournamentMatches'
      | 'watchControl'
      | 'startTournament'
      | 'start'
      | 'startCourt'
      | 'watchTournamentMatches'
      | 'ensureTeams'
    >
{
  readonly match = signal<TournamentMatch | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly teams = signal<ReadonlyMap<string, OverlayTeam>>(new Map<string, OverlayTeam>());
  readonly totalRounds = signal(0);
  readonly categoryMatches = signal<readonly TournamentMatch[]>([]);
  readonly started: string[] = [];
  readonly startedCourts: string[] = [];
  stopped = 0;
  readonly control = signal<BroadcastControl | null>(null);
  /** O dublê nasce com o controle já resolvido (doc ausente/erro = comportamento de antes); o
   *  teste do reload desliga isto pra imitar o gateway real antes do 1º snapshot. */
  readonly controlReady = signal(true);
  readonly controlWatched: string[] = [];
  readonly startedTournaments: string[] = [];
  readonly tournamentMatches = signal<readonly TournamentMatch[]>([]);
  /** Assinaturas de todas as partidas ativas (pódio de categoria escolhida). */
  allMatchesWatchers = 0;
  readonly ensuredTeams: string[] = [];

  watchTournamentMatches(_tournamentId: string): () => void {
    this.allMatchesWatchers++;
    return () => {
      this.allMatchesWatchers--;
    };
  }

  ensureTeams(ids: readonly string[]): void {
    this.ensuredTeams.push(...ids);
  }

  watchControl(tournamentId: string): () => void {
    this.controlWatched.push(tournamentId);
    return () => {};
  }

  startTournament(tournamentId: string): () => void {
    this.startedTournaments.push(tournamentId);
    return () => {
      this.stopped++;
    };
  }

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
        { teamId: 'k', place: 1, points: 8, crowns: 3, removed: false },
        { teamId: 'c', place: 2, points: 7, crowns: 1, removed: false },
        { teamId: 'q', place: 3, points: 2, crowns: 0, removed: false },
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

function controle(over: Partial<BroadcastControl> = {}): BroadcastControl {
  return {
    ...DEFAULT_BROADCAST_CONTROL,
    graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics },
    commands: { ...DEFAULT_BROADCAST_CONTROL.commands },
    ...over,
  };
}

const TARJA: BroadcastInterview = interviewWithDefaults({
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: null,
  shownAt: 1_000,
});

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
          { teamId: 'k', place: 1, points: 8, crowns: 3, removed: false },
          { teamId: 'c', place: 2, points: 7, crowns: 1, removed: false },
          { teamId: 'q', place: 3, points: 2, crowns: 0, removed: false },
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
            { teamId: 'k', place: 1, points: 8, crowns: 3, removed: false },
            { teamId: 'c', place: 2, points: 7, crowns: 1, removed: false },
            { teamId: 'q', place: 3, points: 2, crowns: 0, removed: false },
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

  it('seguindo a quadra: resultado → classificadas → próximos em quadra, sem voltar ao resultado', async () => {
    jasmine.clock().install();
    try {
      const { fixture, fake } = await noFimDaRodada({ matchId: '', tournamentId: 't1', courtId: 'q2' });
      expect(telaAtual(fixture)).toBe('resultado');

      jasmine.clock().tick(20_000);
      await fixture.whenStable();
      expect(telaAtual(fixture)).toBe('classificadas');

      // O gateway troca a partida da quadra ~1 s depois do ciclo; até lá a tabela não pode
      // voltar pro resultado (piscaria antes da troca).
      jasmine.clock().tick(15_000);
      await fixture.whenStable();
      expect(telaAtual(fixture)).toBe('classificadas');

      const encerrada = rodadaEncerrada();
      fake.match.set(
        match({
          id: 'm2',
          status: 'scheduled',
          matchType: 'koc_round',
          matchNumber: 2,
          teamAId: '',
          teamBId: '',
          sets: [],
          currentSetIndex: null,
          koc: { ...encerrada.koc!, teamIds: ['q', 'k', 'c'], standings: [], points: {}, roundLabel: 2 },
        }),
      );
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(telaAtual(fixture)).toBe('nenhuma');
      expect(host.querySelector('og-overlay-koc-preround .card')).not.toBeNull();
      const text = (host.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).toContain('Próximos');
      expect(text).toContain('em quadra');
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

  it('a tela do ar não tem controle nenhum, nem no fim de rodada', async () => {
    const { fixture } = await noFimDaRodada();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button').length).toBe(0);
  });

  it('teclado não muda nada na tela do ar — quem manda é o painel', async () => {
    const { fixture } = await noFimDaRodada();
    for (const key of ['ArrowRight', 'd', 'p', 'l', 'o']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(telaAtual(fixture)).toBe('resultado');
    expect(host.querySelector('og-overlay-doacao .card')).toBeNull();
    expect(host.querySelector('og-overlay-patro .card')).toBeNull();
  });

  it('não instala console de controle (window.NXOverlay)', async () => {
    delete (window as { NXOverlay?: unknown }).NXOverlay;
    await mount({ matchId: 'm1' });

    expect('NXOverlay' in window).toBeFalse();
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

  describe('categoria do pódio escolhida no painel', () => {
    const DUAS_CATEGORIAS = {
      ...TOURNAMENT,
      categories: [
        { id: 'cat1', name: 'Feminina B' },
        { id: 'masc', name: 'Masculino' },
      ],
      courts: [
        { id: 'q2', name: 'Quadra 2' },
        { id: 'q3', name: 'Quadra 3' },
      ],
    } as unknown as OrganizerTournament;

    const finalMasc = match({
      id: 'fm',
      categoryId: 'masc',
      status: 'completed',
      matchType: 'Final',
      winnerSide: 2,
      teamAId: 'tc',
      teamBId: 'td',
      courtId: 'q3',
      court: null,
      sets: [{ a: 18, b: 21 }],
    });

    async function noAr(categoria: string | null) {
      const montado = await mount({ matchId: 'm1' });
      const { fixture, fake } = montado;
      fake.tournament.set(DUAS_CATEGORIAS);
      fake.teams.set(
        new Map([
          ['tc', { label: 'Caio / Davi', players: ['Caio', 'Davi'], photos: [null, null] }],
          ['td', { label: 'Lord / Muralha', players: ['Lord', 'Muralha'], photos: [null, null] }],
        ]),
      );
      // Jogo rolando na quadra acompanhada, de OUTRA categoria.
      fake.match.set(match({ status: 'in_progress' }));
      fake.control.set(controle({ championsCategoryId: categoria }));
      await fixture.whenStable();
      return montado;
    }

    it('mostra o pódio da categoria escolhida, em qualquer quadra, no lugar do placar', async () => {
      const { fixture, fake } = await noAr('masc');
      expect(fake.allMatchesWatchers).toBe(1);
      fake.tournamentMatches.set([finalMasc]);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      const text = (host.textContent ?? '').replace(/\s+/g, ' ');

      expect(host.querySelector('og-overlay-final')).not.toBeNull();
      expect(host.querySelector('og-overlay-scoreboard')).toBeNull();
      expect(text).toContain('Lord');
      expect(text).toContain('Masculino');
      expect(text).toContain('Masculino · Quadra 3');
      expect(text).not.toContain('Quadra Quadra');
      expect(fake.ensuredTeams).toEqual(jasmine.arrayContaining(['td', 'tc']));
    });

    it('final da categoria ainda não decidida: nada de pódio, o placar segue', async () => {
      const { fixture, fake } = await noAr('masc');
      fake.tournamentMatches.set([{ ...finalMasc, status: 'in_progress' }]);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('og-overlay-final')).toBeNull();
      expect(host.querySelector('og-overlay-scoreboard')).not.toBeNull();
    });

    it('voltar pro automático solta a assinatura e o pódio sai', async () => {
      const { fixture, fake } = await noAr('masc');
      fake.tournamentMatches.set([finalMasc]);
      await fixture.whenStable();
      fake.control.set(controle({ championsCategoryId: null }));
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(fake.allMatchesWatchers).toBe(0);
      expect(host.querySelector('og-overlay-final')).toBeNull();
      expect(host.querySelector('og-overlay-scoreboard')).not.toBeNull();
    });

    it('automático não assina as partidas do torneio', async () => {
      const { fake } = await noAr(null);
      expect(fake.allMatchesWatchers).toBe(0);
    });
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

/** Patrocinadores: a lista vem do torneio (cadastro no detalhe do torneio) e o card só
 *  existe se houver patrocinador. A regra do "quando" tem teste próprio
 *  (overlay-patro-cycle.spec); aqui é a FIAÇÃO — torneio → card na tela. */
describe('OverlayPageComponent — patrocinadores', () => {
  const comPatro = {
    ...TOURNAMENT,
    sponsors: [
      { id: 's1', name: 'Loja Areia', logoUrl: '' },
      { id: 's2', name: 'Açaí da Praia', logoUrl: '' },
    ],
  } as unknown as OrganizerTournament;

  function card(el: HTMLElement): HTMLElement | null {
    return el.querySelector('og-overlay-patro .card');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('"Mostrar agora" do painel mostra o card com o 1º patrocinador do torneio', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set(comPatro);
    fake.match.set(match({}));
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ commands: { donationNowAt: 0, sponsorsNowAt: 900 } }));
    await fixture.whenStable();

    const el = card(fixture.nativeElement as HTMLElement);
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Loja Areia');
    expect(el!.textContent).toContain('Oferecimento');
  });

  it('sem patrocinador cadastrado o card não aparece nem forçado', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set(TOURNAMENT);
    fake.match.set(match({}));
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ commands: { donationNowAt: 0, sponsorsNowAt: 900 } }));
    await fixture.whenStable();

    expect(card(fixture.nativeElement as HTMLElement)).toBeNull();
  });
});

describe('OverlayPageComponent — controle do painel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('assina o controle do torneio da partida', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    await fixture.whenStable();

    expect(fake.controlWatched).toEqual(['t1']);
  });

  it('placar desligado no painel sai do ar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-scoreboard')).toBeNull();
  });

  it('tarja no ar toma a tela: o placar sai e a tarja entra', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ interview: TARJA }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-scoreboard')).toBeNull();
    expect(host.querySelector('og-overlay-interview .nome')?.textContent).toContain('Ana Souza');
  });

  it('"Tirar do ar" devolve o placar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ interview: TARJA }));
    await fixture.whenStable();
    fake.control.set(controle({ interview: null }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-scoreboard')).not.toBeNull();
  });

  it('tarja temporizada sai sozinha depois da duração', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 1, 12, 0, 0));
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.control.set(controle());
      await fixture.whenStable();
      fake.control.set(controle({ interview: { ...TARJA, durationSec: 20 } }));
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('og-overlay-interview .terco[data-phase="in"]')).not.toBeNull();

      jasmine.clock().tick(18_000);
      await fixture.whenStable();
      expect(host.querySelector('og-overlay-interview .terco[data-phase="in"]')).not.toBeNull();

      jasmine.clock().tick(3_000);
      await fixture.whenStable();
      // A saída mantém os blocos no DOM enquanto animam — o que importa é não estar mais "no ar".
      expect(host.querySelector('og-overlay-interview .terco[data-phase="in"]')).toBeNull();

      jasmine.clock().tick(1_000);
      await fixture.whenStable();
      expect(host.querySelector('og-overlay-interview .terco')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('recarregar o OBS no meio de tarja temporizada não a reexibe — nem no snapshot seguinte', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle({ interview: { ...TARJA, durationSec: 20 } }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-interview .nome')).toBeNull();

    fake.control.set(
      controle({
        interview: { ...TARJA, durationSec: 20 },
        graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, champions: false },
      }),
    );
    await fixture.whenStable();

    expect(host.querySelector('og-overlay-interview .nome')).toBeNull();
    expect(host.querySelector('og-overlay-scoreboard')).not.toBeNull();
  });

  it('tarja "até tirar" já no 1º snapshot continua no ar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.control.set(controle({ interview: TARJA }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-interview .nome')).not.toBeNull();
  });

  it('"Mostrar agora" da doação dispara no carimbo novo, não no da linha de base', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.control.set(controle({ commands: { donationNowAt: 500, sponsorsNowAt: 0 } }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-doacao .card')).toBeNull();

    fake.control.set(controle({ commands: { donationNowAt: 900, sponsorsNowAt: 0 } }));
    await fixture.whenStable();

    expect(host.querySelector('og-overlay-doacao .card')).not.toBeNull();
  });

  it('mexer em outra chave não derruba o card da doação que está no ar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ commands: { donationNowAt: 900, sponsorsNowAt: 0 } }));
    await fixture.whenStable();
    fake.control.set(
      controle({
        commands: { donationNowAt: 900, sponsorsNowAt: 0 },
        graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false },
      }),
    );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-doacao .card')).not.toBeNull();
  });

  it('doação desligada no painel não entra no ciclo automático', async () => {
    jasmine.clock().install();
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.control.set(controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, donation: false } }));
      await fixture.whenStable();
      jasmine.clock().tick(4_000);
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-doacao .card')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('fim de rodada fixado no painel mostra as classificadas e não reveza', async () => {
    jasmine.clock().install();
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.tournament.set(TOURNAMENT);
      const encerrada = rodadaEncerrada();
      fake.categoryMatches.set([encerrada]);
      fake.match.set(encerrada);
      fake.control.set(controle({ kocRoundEndScreen: 'classificadas' }));
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('og-overlay-koc-qualified')).not.toBeNull();

      jasmine.clock().tick(40_000);
      await fixture.whenStable();

      expect(host.querySelector('og-overlay-koc-qualified')).not.toBeNull();
      expect(host.querySelector('og-overlay-koc-standings')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('recarregar o OBS com o placar desligado não faz o placar piscar: nada entra antes do controle', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.controlReady.set(false);
    fake.match.set(match({}));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-scoreboard')).toBeNull();

    fake.control.set(controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } }));
    fake.controlReady.set(true);
    await fixture.whenStable();

    expect(host.querySelector('og-overlay-scoreboard')).toBeNull();
  });

  it('"Mostrar agora" do patrocínio não entra por cima da tarja', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.tournament.set({
      ...TOURNAMENT,
      sponsors: [{ id: 's1', name: 'Loja Areia', logoUrl: '' }],
    } as unknown as OrganizerTournament);
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ interview: TARJA, commands: { donationNowAt: 0, sponsorsNowAt: 900 } }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-patro .card')).toBeNull();
  });

  it('Grande final ligada no painel acende o visual final no duelo', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle({ finalMode: 'on' }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.status--final-mode')).not.toBeNull();
  });
});

describe('OverlayPageComponent — /transmissao', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('sem quadra escolhida, assina só o torneio e o controle', async () => {
    const { fake } = await mount({ tournamentId: 't1', transmissao: true });

    expect(fake.startedTournaments).toEqual(['t1']);
    expect(fake.startedCourts).toEqual([]);
    expect(fake.controlWatched).toEqual(['t1']);
  });

  it('segue a quadra escolhida no painel e troca quando ela muda', async () => {
    const { fixture, fake } = await mount({ tournamentId: 't1', transmissao: true });
    fake.control.set(controle({ courtId: 'q1' }));
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q1']);

    fake.control.set(controle({ courtId: 'q2' }));
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q1', 't1/q2']);
    expect(fake.stopped).toBeGreaterThanOrEqual(2);
  });

  it('mexer em outra chave não reassina a quadra', async () => {
    const { fixture, fake } = await mount({ tournamentId: 't1', transmissao: true });
    fake.control.set(controle({ courtId: 'q1' }));
    await fixture.whenStable();
    fake.control.set(
      controle({ courtId: 'q1', graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } }),
    );
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q1']);
  });

  it('quadra fixa na URL ganha da escolha do painel', async () => {
    const { fixture, fake } = await mount({ tournamentId: 't1', courtId: 'q9' });
    fake.control.set(controle({ courtId: 'q1' }));
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q9']);
  });
});
