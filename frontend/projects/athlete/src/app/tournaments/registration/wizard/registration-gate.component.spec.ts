import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { AtPanelShellComponent } from '../../../painel/at-panel-shell.component';
import type { AthleteTournamentRegistration, SentPartnerInvite, TournamentPartnerInvite } from '../../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../../../data/tournaments-repository';
import { RegistrationGateComponent } from './registration-gate.component';
import { RegistrationWizardStore } from './registration-wizard.store';

/** A casca do portal monta o menu e ouve convites — nada disso é o assunto do porteiro, e
 *  deixá-la de pé abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

function offer(id: string, overrides: Partial<TournamentCategoryOffer> = {}): TournamentCategoryOffer {
  return {
    id,
    categoryName: `Categoria ${id}`,
    entryFee: 100,
    maxTeams: 16,
    spotsLeft: 8,
    level: null,
    minLevel: null,
    genderType: 'M',
    teamSize: null,
    genderFree: false,
    genderComposition: null,
    bracketFormat: 'groups_knockout',
    registrationClosed: false,
    isCompleted: false,
    prizes: [],
    qualifiersPerGroup: 2,
    uniformType: null,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    uniformSizeOptionsTop: [],
    uniformSizeOptionsShorts: [],
    ageBand: null,
    ageRestrictionMode: null,
    ageMinYears: null,
    ageMaxYears: null,
    ageReference: null,
    ...overrides,
  };
}

function registration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'r1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamId: null,
    partnerPending: false,
    isPaid: false,
    waitlist: false,
    cancellationRequest: null,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: 'me',
    participantUids: ['me'],
    lgpdAcceptedUids: ['me'],
    uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    teamName: null,
    teamSize: null,
    captainUid: null,
    uniformByUid: {},
    substitutionHistory: [],
    holdExpiresAt: null,
    ...overrides,
  } as AthleteTournamentRegistration;
}

/** Dublê do store: só os sinais que o porteiro lê. O store de verdade abre listeners do
 *  Firestore no construtor — o assunto aqui é a DECISÃO, não a leitura. */
class FakeStore {
  readonly tournamentId = signal('t1');
  readonly accountLabel = signal('Atleta');
  readonly myUid = signal<string | null>('me');
  readonly tournament = signal<TournamentSummary | null>(null);
  readonly tournamentLoaded = signal(true);
  readonly loadFailed = signal(false);
  readonly profile = signal(null);
  readonly profileLoaded = signal(true);
  readonly myRegistrations = signal<AthleteTournamentRegistration[]>([]);
  readonly registrationsLoaded = signal(true);
  readonly sentInvites = signal<SentPartnerInvite[]>([]);
  readonly sentInvitesLoaded = signal(true);
  readonly receivedInvites = signal<TournamentPartnerInvite[]>([]);

  categories(): TournamentCategoryOffer[] {
    return this.tournament()?.categories ?? [];
  }
  ready(): boolean {
    return this.tournamentLoaded() && this.profileLoaded() && this.registrationsLoaded() && this.sentInvitesLoaded();
  }
  categoryById(id: string | null) {
    return this.categories().find((c) => c.id === id) ?? null;
  }
  registrationFor(id: string | null) {
    return this.myRegistrations().find((r) => r.categoryId === id) ?? null;
  }
  registrationById(id: string | null) {
    return this.myRegistrations().find((r) => r.id === (id ?? '').trim()) ?? null;
  }
  receivedInviteFor(id: string | null) {
    return this.receivedInvites().find((i) => i.tournamentId === 't1' && i.categoryId === id) ?? null;
  }
  pendingSentInvitesFor(id: string | null) {
    return this.sentInvites().filter((i) => i.status === 'pending' && i.tournamentId === 't1' && i.categoryId === id);
  }
  uniformCompleteFor(): boolean {
    return true;
  }
  retry(): void {}
}

function tournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Open Teste',
    sport: 'BEACH_TENNIS',
    requireFormedPair: false,
    registrationOpensAt: null,
    registrationClosesAt: null,
    startAt: null,
    categories: [offer('c1'), offer('c2')],
    ...overrides,
  } as unknown as TournamentSummary;
}

describe('RegistrationGateComponent', () => {
  let store: FakeStore;
  let navigate: jasmine.Spy;
  let query$: BehaviorSubject<ParamMap>;

  function setup(queryParams: Record<string, string> = {}): void {
    store = new FakeStore();
    navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
    query$ = new BehaviorSubject<ParamMap>(convertToParamMap(queryParams));

    TestBed.configureTestingModule({
      imports: [RegistrationGateComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: RegistrationWizardStore, useValue: store as unknown as RegistrationWizardStore },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: query$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ id: 't1' }), queryParamMap: query$.value },
          },
        },
      ],
    }).overrideComponent(RegistrationGateComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
  }

  function render(): void {
    const fixture = TestBed.createComponent(RegistrationGateComponent);
    fixture.detectChanges();
  }

  function lastNavigation(): { commands: unknown[]; extras: { queryParams?: Record<string, string> } } {
    const args = navigate.calls.mostRecent().args;
    return { commands: args[0] as unknown[], extras: (args[1] ?? {}) as { queryParams?: Record<string, string> } };
  }

  // Decidir com as leituras ainda em voo fazia "retomar o que já começou" perder para
  // "primeira categoria livre" — o beco sem saída da vaga solo pendente.
  it('não decide nada enquanto as leituras não resolveram', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    store.registrationsLoaded.set(false);
    render();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sem categoria resolvível manda para a LISTA de categorias, não para o passo 1', () => {
    setup();
    store.tournament.set(tournament());
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'categorias']);
  });

  it('torneio de categoria única resolve a categoria sozinho', () => {
    setup();
    store.tournament.set(tournament({ categories: [offer('c1')] }));
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'consentimento']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1' });
  });

  it('atleta do zero cai no consentimento', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'consentimento']);
  });

  it('convite recebido abre as condições', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    store.receivedInvites.set([
      { id: 'i1', tournamentId: 't1', categoryId: 'c1', inviterUid: 'x', inviterName: 'Ana' } as TournamentPartnerInvite,
    ]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'condicoes']);
  });

  // Convidar não cria inscrição — sem este ramo, quem voltasse por notificação refazia o
  // consentimento com um convite já em voo.
  it('convite ENVIADO pendente abre a espera, não a busca de parceiro', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    store.sentInvites.set([
      { id: 's1', tournamentId: 't1', categoryId: 'c1', status: 'pending' } as SentPartnerInvite,
    ]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'aguardando']);
  });

  it('reserva solo SEM convite volta para a busca de parceiro', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    store.myRegistrations.set([registration({ partnerPending: true })]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'parceiro']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1', registro: 'r1' });
  });

  it('inscrição paga e completa vai para a aba "minha inscrição"', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    store.myRegistrations.set([registration({ isPaid: true })]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'minha-inscricao']);
  });

  it('a categoria sai da inscrição indicada pela rota quando não veio `categoria`', () => {
    setup({ registro: 'r1' });
    store.tournament.set(tournament());
    store.myRegistrations.set([registration({ categoryId: 'c2', isPaid: true })]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'minha-inscricao']);
  });

  // Links do app usam `categoryId`; os do portal usam `categoria`. Aceitar só uma grafia
  // transformaria o push do celular aberto no navegador numa volta ao começo do fluxo.
  it('aceita a grafia do app nos parâmetros', () => {
    setup({ categoryId: 'c1', lgpd: '1' });
    store.tournament.set(tournament());
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'condicoes']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1', lgpd: '1' });
  });

  it('o `step` pedido é obedecido quando a etapa já está liberada', () => {
    setup({ categoria: 'c1', registro: 'r1', step: 'uniforme' });
    store.tournament.set(tournament());
    store.myRegistrations.set([registration()]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'uniforme']);
  });

  it('o `step` pedido NÃO pula um passo pendente', () => {
    setup({ categoria: 'c1', registro: 'r1', step: 'pagamento' });
    store.tournament.set(tournament());
    store.myRegistrations.set([registration({ partnerPending: true })]);
    render();
    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao', 'parceiro']);
  });

  // Cada snapshot novo do Firestore reempurraria a rota por cima da tela que o atleta está
  // usando.
  it('decide uma vez só, mesmo com o store emitindo de novo', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(tournament());
    render();
    expect(navigate).toHaveBeenCalledTimes(1);
    store.myRegistrations.set([registration()]);
    TestBed.tick();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('falha de carregamento mostra a saída em vez de um loader eterno', () => {
    setup({ categoria: 'c1' });
    store.loadFailed.set(true);
    const fixture = TestBed.createComponent(RegistrationGateComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Não foi possível abrir a inscrição');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('torneio inexistente mostra a saída', () => {
    setup({ categoria: 'c1' });
    store.tournament.set(null);
    const fixture = TestBed.createComponent(RegistrationGateComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Torneio não encontrado');
  });
});
