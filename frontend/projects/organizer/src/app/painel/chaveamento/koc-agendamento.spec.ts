import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AgendamentoComponent } from './agendamento.component';
import { ChaveamentoContextService } from './chaveamento-context.service';
import type { TournamentMatch } from '../data/matches-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament } from '../data/tournament.model';

/** Reprodução do torneio real "Seed testt" (`NmmfPlnPRNNPmPcvBJWk`, projeto dev):
 *  King of the Court, 2 quadras reais, 7 partidas sem quadra/horário. */
function kocTournament(): OrganizerTournament {
  return {
    id: 'NmmfPlnPRNNPmPcvBJWk',
    name: 'Seed testt',
    managerId: 'lcBjiBx691P5WMQdHed85FaWXgM2',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: new Date('2026-09-21T03:00:00.000Z'),
    endAt: new Date('2026-09-22T03:00:00.000Z'),
    city: null,
    location: null,
    categories: [
      {
        id: 'intermediario_2-masc', name: 'Intermediário 2 Masculino', maxTeams: 16, entryFee: 0,
        teamSize: null, bracketFormat: 'king_of_court', teamsPerGroup: 4, qualifiersPerGroup: 2,
        bestOf: null, uniformType: null, uniformNumberOnShirt: false, uniformNameOnShirt: false,
        uniformSizeOptionsTop: [], uniformSizeOptionsShorts: [],
      },
    ],
    capacity: null,
    waitlistEnabled: true,
    leagueId: null,
    courts: [
      { id: 'Q1', name: 'Quadra 1', order: 1 },
      { id: 'Q2', name: 'Quadra 2', order: 2 },
    ],
    courtsCount: 2,
    matchOps: { dayStart: '07:00', dayEnd: '24:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30, dynamicRescheduleEnabled: false },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    myRole: 'owner',
  };
}

/** Partida KoC como o builder grava: sem teamAId/teamBId (as 4 equipes vivem em kocTeamIds). */
function kocMatch(n: number, matchType: string): TournamentMatch {
  return {
    id: `koc-${n}`, tournamentId: 'NmmfPlnPRNNPmPcvBJWk', categoryId: 'intermediario_2-masc',
    round: null, team1Label: 'A definir', team2Label: 'A definir', score: null, winnerSide: null,
    scheduledAt: null, court: null, status: 'scheduled', teamAId: '', teamBId: '', sets: [],
    courtId: '', dayKey: '', scheduleEndAt: null, bestOf: 1, matchType, roundNumber: 1,
    matchNumber: n, winnerAdvanceMatchNumber: null, winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null, teamADescription: null, teamBDescription: null,
  } as unknown as TournamentMatch;
}

const KOC_MATCHES = [
  kocMatch(1, 'koc_round'), kocMatch(2, 'koc_round'), kocMatch(3, 'koc_round'),
  kocMatch(4, 'koc_round'), kocMatch(5, 'koc_semifinal'), kocMatch(6, 'koc_semifinal'),
  kocMatch(7, 'koc_final'),
];

class CtxStub {
  readonly loadingTournaments = signal(false);
  readonly loadingMatches = signal(false);
  readonly tournaments = signal([kocTournament()]);
  readonly tournament = signal<OrganizerTournament | null>(kocTournament());
  readonly selectedTournamentId = signal<string | null>('NmmfPlnPRNNPmPcvBJWk');
  readonly selectedCategoryId = signal<string | null>('intermediario_2-masc');
  readonly categoryName = signal<string | null>('Intermediário 2 Masculino');
  readonly matches = signal<TournamentMatch[]>(KOC_MATCHES);
  readonly matchesFiltered = signal<TournamentMatch[]>(KOC_MATCHES);
  reloadMatches = jasmine.createSpy('reloadMatches').and.resolveTo(undefined);
}

describe('AgendamentoComponent — torneio King of the Court', () => {
  let fixture: ComponentFixture<AgendamentoComponent>;
  let ctx: CtxStub;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    ctx = new CtxStub();
    await TestBed.configureTestingModule({
      imports: [AgendamentoComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ChaveamentoContextService, useValue: ctx },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AgendamentoComponent);
    (fixture.componentInstance as unknown as { narrow: WritableSignal<boolean> }).narrow.set(false);
    fixture.detectChanges();
  });

  /** O caso real: o seed apagou e recriou a conta do organizador, entao a sessao do
   *  navegador ficou apontando pra um uid que nao e mais dono de nada. `listMyTournaments`
   *  devolve lista vazia, mas as partidas continuam carregando (sao consultadas pelo
   *  tournamentId da rota, numa colecao publica). O resultado era uma grade FANTASMA:
   *  desenhada, sem uma unica coluna de quadra e sem dizer o motivo. */
  describe('torneio fora do alcance do usuario (sessao de conta apagada)', () => {
    beforeEach(() => {
      ctx.tournaments.set([]);
      ctx.tournament.set(null);
      fixture.detectChanges();
    });

    it('nao desenha grade sem nenhuma quadra', () => {
      const grade = host().querySelector('.og-agenda-grid');
      const colunas = host().querySelectorAll('.og-agenda-col-label').length;
      expect(grade != null && colunas === 0).toBeFalse();
    });

    it('explica que o torneio nao esta disponivel em vez de ficar em branco', () => {
      expect(host().querySelector('.og-agenda-empty')?.textContent ?? '').toContain('não está disponível');
    });
  });

  it('desenha uma coluna por quadra real do torneio', () => {
    expect(Array.from(host().querySelectorAll('.og-agenda-col-label')).map((e) => e.textContent?.trim()))
      .toEqual(['Quadra 1', 'Quadra 2']);
  });

  it('lista as 7 partidas KoC na fila de agendamento', () => {
    expect(host().querySelectorAll('.og-agenda-fila-item').length).toBe(7);
  });
});
