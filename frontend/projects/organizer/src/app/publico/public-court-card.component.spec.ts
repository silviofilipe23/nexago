import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { PublicCourtCardComponent } from './public-court-card.component';

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
    dayKey: '',
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
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

describe('PublicCourtCardComponent', () => {
  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [PublicCourtCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('mostra as duplas e o ponto do set corrente numa partida ao vivo', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 1');
    fixture.componentRef.setInput('kind', 'live');
    fixture.componentRef.setInput('categoryLabel', 'Feminina B');
    fixture.componentRef.setInput(
      'match',
      match({
        status: 'in_progress',
        sets: [
          { a: 21, b: 18 },
          { a: 7, b: 5 },
        ],
        currentSetIndex: 1,
      }),
    );
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Carla / Dani');
    expect(text).toContain('AO VIVO');
    expect(text).toContain('Feminina B');
    // Asserir todos os 4 números: sets ganhos (1, 0) + pontos do set (7, 5).
    expect(text).toContain('1');
    expect(text).toContain('0');
    expect(text).toContain('7');
    expect(text).toContain('5');
  });

  it('partida de games: games do set e ponto do game', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 1');
    fixture.componentRef.setInput('kind', 'live');
    fixture.componentRef.setInput(
      'match',
      match({
        status: 'in_progress',
        teamAId: 'tA',
        teamBId: 'tB',
        scoringProfile: { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 },
        sets: [{ a: 6, b: 4 }, { a: 5, b: 3 }],
        currentSetIndex: 1,
        currentGame: { a: 3, b: 1 },
      }),
    );
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('.pub-court-games')].map((e) => e.textContent?.trim())).toEqual(['5', '3']);
    expect([...el.querySelectorAll('.pub-court-points')].map((e) => e.textContent?.trim())).toEqual(['40', '15']);
  });

  it('super tie-break em andamento: sem games zerados, só os pontos', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 1');
    fixture.componentRef.setInput('kind', 'live');
    fixture.componentRef.setInput(
      'match',
      match({
        status: 'in_progress',
        teamAId: 'tA',
        teamBId: 'tB',
        scoringProfile: { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 },
        sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 0, b: 0 }],
        currentSetIndex: 2,
        currentGame: { a: 7, b: 5 },
      }),
    );
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.pub-court-games').length).toBe(0);
    expect([...el.querySelectorAll('.pub-court-points')].map((e) => e.textContent?.trim())).toEqual(['7', '5']);
  });

  it('anuncia o horário da próxima partida da quadra', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 2');
    fixture.componentRef.setInput('kind', 'next');
    fixture.componentRef.setInput(
      'match',
      match({ scheduledAt: new Date(Date.UTC(2026, 7, 18, 21, 30)) }),
    );
    await fixture.whenStable();

    // 21:30 UTC = 18:30 na parede de São Paulo (fuso canônico do agendamento).
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('18:30');
  });

  it('diz que a quadra está livre quando não há jogo', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 3');
    fixture.componentRef.setInput('kind', 'free');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Quadra livre');
  });

  it('renderiza fallback quando não há match (kind não é free)', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 4');
    fixture.componentRef.setInput('kind', 'next');
    // match é null por default; não setamos nada
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem jogo por enquanto.');
  });

  it('na rodada KOTC mostra trono × desafiante em vez de placar de sets', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 1');
    fixture.componentRef.setInput('kind', 'live');
    fixture.componentRef.setInput('nowMs', Date.now());
    fixture.componentRef.setInput(
      'teamNames',
      new Map([
        ['king', 'Martins / Costa'],
        ['chal', 'Ferreira / Nunes'],
      ]),
    );
    fixture.componentRef.setInput(
      'match',
      match({
        status: 'in_progress',
        matchType: 'koc_round',
        team1Label: '',
        team2Label: '',
        koc: {
          teamIds: ['king', 'chal', 'q'],
          kingTeamId: 'king',
          challengerTeamId: 'chal',
          queue: ['q'],
          points: { king: 7, chal: 5, q: 2 },
          rallies: 12,
          servingTeamId: 'chal',
          clock: { endsAtMs: Date.now() + 120_000, durationSec: 900, pausedAtMs: null },
          standings: [],
          qualifiersPerRound: 2,
          teamsPerCourt: 4,
          roundsPerBracket: 1,
          configuredDurationSec: 900,
          rallySeq: 12,
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

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No trono');
    expect(text).toContain('Martins / Costa');
    expect(text).toContain('Desafiante');
    expect(text).toContain('Ferreira / Nunes');
    expect(text).toContain('7 pts');
    expect(text).not.toContain('Ana / Bia');
  });
});
