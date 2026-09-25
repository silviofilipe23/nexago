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
        kocTeamsPerCourt: 4, kocRoundsPerBracket: 1, kocQualifiersPerRound: 2,
        kocPhases: null, kocMaxTeamsPerRound: 5, kocRoundDurationSec: 900,
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
function kocMatch(
  n: number,
  matchType: string,
  teamIds = ['t1', 't2', 't3', 't4'],
  qualifierSlots: string[] = [],
): TournamentMatch {
  return {
    id: `koc-${n}`, tournamentId: 'NmmfPlnPRNNPmPcvBJWk', categoryId: 'intermediario_2-masc',
    koc: {
      teamIds, kingTeamId: '', challengerTeamId: '', queue: [], points: {}, rallies: 0,
      servingTeamId: '', clock: null, standings: [], qualifiersPerRound: 2,
      configuredDurationSec: 900, rallySeq: 0, rallyLog: [], roundLabel: n, qualifierSlots,
    },
    round: 'Classificatória · Rodada 1', team1Label: 'A definir', team2Label: 'A definir', score: null, winnerSide: null,
    scheduledAt: null, court: null, status: 'scheduled', teamAId: '', teamBId: '', sets: [],
    courtId: '', dayKey: '', scheduleEndAt: null, bestOf: 1, matchType, roundNumber: 1,
    matchNumber: n, winnerAdvanceMatchNumber: null, winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null, teamADescription: null, teamBDescription: null,
  } as unknown as TournamentMatch;
}

const KOC_MATCHES = [
  kocMatch(1, 'koc_round'), kocMatch(2, 'koc_round'), kocMatch(3, 'koc_round'),
  kocMatch(4, 'koc_round'),
  // Semis e final nascem SEM elenco: o que as descreve são as vagas.
  kocMatch(5, 'koc_semifinal', [], ['1º Rodada 1', '2º Rodada 2', '1º Rodada 3', '2º Rodada 4']),
  kocMatch(6, 'koc_semifinal', [], ['1º Rodada 2', '2º Rodada 1', '1º Rodada 4', '2º Rodada 3']),
  kocMatch(7, 'koc_final', [], ['1º Semifinal 1', '2º Semifinal 1', '1º Semifinal 2', '2º Semifinal 2']),
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

  /** Super admin abrindo evento alheio pela aba Plataforma: `listMyTournaments` não traz o
   *  torneio (é dono + staff), mas o doc dele chega pelo id da rota — ver `tournamentReach`.
   *  A grade tem que sair mesmo com a lista de eventos próprios vazia. */
  describe('torneio alheio alcançado por super admin', () => {
    beforeEach(() => {
      ctx.tournaments.set([]);
      fixture.detectChanges();
    });

    it('desenha as quadras do torneio, sem evento próprio na lista', () => {
      expect(Array.from(host().querySelectorAll('.og-agenda-col-label')).map((e) => e.textContent?.trim()))
        .toEqual(['Quadra 1', 'Quadra 2']);
      expect(host().querySelector('.og-agenda-empty')).toBeNull();
    });

    it('avisa que a chave não foi gerada quando não há partida', () => {
      ctx.matches.set([]);
      ctx.matchesFiltered.set([]);
      fixture.detectChanges();
      expect(host().querySelector('.og-agenda-empty')?.textContent ?? '').toContain('Chaves ainda não geradas');
    });
  });

  it('desenha uma coluna por quadra real do torneio', () => {
    expect(Array.from(host().querySelectorAll('.og-agenda-col-label')).map((e) => e.textContent?.trim()))
      .toEqual(['Quadra 1', 'Quadra 2']);
  });

  it('lista as 7 partidas KoC na fila de agendamento', () => {
    expect(host().querySelectorAll('.og-agenda-fila-item').length).toBe(7);
  });

  /** A rodada não tem confronto: "A definir vs A definir" não diz nada sobre o
   *  que se está agendando, e era o que a fila mostrava nas 7 linhas. */
  it('identifica a rodada pelo elenco, não por um confronto que não existe', () => {
    const linhas = Array.from(host().querySelectorAll('.og-agenda-fila-item .partida'))
      .map((e) => e.textContent?.trim() ?? '');
    expect(linhas.length).toBe(7);
    for (const linha of linhas) {
      expect(linha).not.toContain('A definir');
    }
    // As 4 classificatórias já têm elenco fechado.
    expect(linhas.slice(0, 4)).toEqual(['4 duplas', '4 duplas', '4 duplas', '4 duplas']);
  });

  /** Semis e final nascem sem elenco. As vagas são o análogo do "Vencedor Jogo
   *  #7": descrevem a rodada e é o que permite pré-reservar o horário dela. */
  it('descreve a fase seguinte pelas vagas, não por um elenco que ainda não existe', () => {
    const linhas = Array.from(host().querySelectorAll('.og-agenda-fila-item .partida'))
      .map((e) => e.textContent?.trim() ?? '');
    for (const linha of linhas.slice(4)) {
      expect(linha).toBe('4 vagas');
    }
    // De onde vem cada vaga fica na linha de apoio, que é onde se decide.
    const metas = Array.from(host().querySelectorAll('.og-agenda-fila-item .meta'))
      .map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(metas[4]).toContain('1º Rodada 1 · 2º Rodada 2');
    expect(metas[0]).not.toContain('Rodada 1 ·');
  });
});
