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
});
