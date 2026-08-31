import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoriaDetalheComponent } from './categoria-detalhe.component';
import { EMPTY_INSCRIPTION_UNIFORM, type TournamentInscription } from '../data/inscriptions-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament } from '../data/tournament.model';

function inscription(over: Partial<TournamentInscription> = {}): TournamentInscription {
  return {
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'femB',
    teamId: 'team-1',
    teamName: 'Ana Paula / Beatriz Costa',
    customTeamName: null,
    participants: [],
    participantNames: ['Ana Paula', 'Beatriz Costa'],
    paymentStatus: 'paid',
    paid: true,
    paidByOrganizer: false,
    needsVerification: false,
    sharePaidCount: 0,
    sharePaidUids: [],
    organizerConfirmedShareUids: [],
    partnerPending: false,
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_INSCRIPTION_UNIFORM,
    uniformPlayer2: EMPTY_INSCRIPTION_UNIFORM,
    uniformByUid: {},
    teamSize: null,
    captainUid: null,
    cancellationRequest: null,
    createdAt: null,
    ...over,
  };
}

function tournament(): OrganizerTournament {
  return {
    id: 't1',
    name: 'Circuito Verão 2026',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [
      {
        id: 'femB',
        name: 'Masculino B',
        maxTeams: null,
        entryFee: 0,
        teamSize: null,
        bracketFormat: null,
        teamsPerGroup: 3,
        qualifiersPerGroup: 2,
        bestOf: null,
        uniformType: null,
        uniformNumberOnShirt: false,
        uniformNameOnShirt: false,
        uniformSizeOptionsTop: [],
        uniformSizeOptionsShorts: [],
      },
    ],
    capacity: null,
    leagueId: null,
    courts: [],
    courtsCount: 0,
    matchOps: { dayStart: '08:00', dayEnd: '22:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30, dynamicRescheduleEnabled: false },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
  };
}

/** Estado interno que o teste alimenta na mão: com `id` vazio o efeito de carga devolve na
 *  primeira linha (`if (!tid || !cid) return`), então nada de Firestore entra em cena e a tela
 *  fica exatamente com os dados que este spec colocar. */
interface Internals {
  tournament: WritableSignal<OrganizerTournament | null>;
  inscriptions: WritableSignal<TournamentInscription[]>;
}

describe('CategoriaDetalheComponent — exportar lista de atletas', () => {
  let fixture: ComponentFixture<CategoriaDetalheComponent>;

  async function mount(inscriptions: TournamentInscription[]): Promise<HTMLElement> {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [CategoriaDetalheComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(CategoriaDetalheComponent);
    fixture.componentRef.setInput('catId', 'femB');
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.inscriptions.set(inscriptions);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('copia torneio, categoria e as equipes numeradas', async () => {
    const written: string[] = [];
    spyOn(navigator.clipboard, 'writeText').and.callFake((t: string) => {
      written.push(t);
      return Promise.resolve();
    });
    const el = await mount([
      inscription(),
      inscription({ id: 'i2', teamName: 'Pedro Lima', participantNames: ['Pedro Lima'], partnerPending: true }),
    ]);

    (el.querySelector('button.og-export-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(written).toEqual([
      [
        'Circuito Verão 2026',
        'Masculino B',
        'Equipes:',
        '1 - Ana Paula e Beatriz Costa',
        '2 - Pedro Lima e parceiro',
      ].join('\n'),
    ]);
    expect(el.querySelector('.og-banner')?.textContent).toContain('2 duplas');
  });

  /** Sem área de transferência (contexto inseguro, permissão negada) o banner não pode dizer que
   *  copiou — o organizador vai colar no grupo e mandar a mensagem anterior. */
  it('área de transferência bloqueada não vira "copiada" mentiroso', async () => {
    // `callFake` (e não `returnValue`) porque a promessa rejeitada precisa nascer no clique: criada
    // no setup do spy, ela é recusada antes de qualquer `await` e o Chrome a reporta como
    // unhandled rejection, derrubando o teste por fora da asserção.
    spyOn(navigator.clipboard, 'writeText').and.callFake(() => Promise.reject(new Error('denied')));
    const el = await mount([inscription()]);

    (el.querySelector('button.og-export-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    const banner = el.querySelector('.og-banner');
    expect(banner?.classList.contains('win')).toBe(false);
    expect(banner?.textContent).toContain('Não foi possível copiar');
  });

  it('categoria sem inscrição não oferece o botão', async () => {
    const el = await mount([]);

    expect(el.querySelector('button.og-export-btn')).toBeNull();
  });
});
