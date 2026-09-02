import { Component, input, output, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { AuthService } from '../../../../auth/auth.service';
import type {
  AthleteTournamentRegistration,
  SentPartnerInvite,
} from '../../../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../../../../data/tournaments-repository';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { RegistrationWaitingComponent } from './registration-waiting.component';

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
  } as TournamentCategoryOffer;
}

function tournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Open Teste',
    sport: 'BEACH_TENNIS',
    categories: [offer('c1')],
    ...overrides,
  } as unknown as TournamentSummary;
}

function invite(overrides: Partial<SentPartnerInvite> = {}): SentPartnerInvite {
  return {
    id: 'i1',
    // Vazio de propósito: o efeito da foto do parceiro só busca `public_profiles` com uid.
    inviteeUid: '',
    inviteeName: 'Bruno Silva',
    expiresAt: new Date(Date.now() + 3600_000),
    createdAt: new Date(Date.now() - 60_000),
    tournamentId: 't1',
    categoryId: 'c1',
    status: 'pending',
    registrationId: null,
    isTeamInvite: false,
    teamName: null,
    isSubstitutionInvite: false,
    replacedName: null,
    attachRegistrationId: null,
    ...overrides,
  };
}

class FakeStore {
  readonly tournamentId = signal('t1');
  readonly accountLabel = signal('Atleta');
  readonly myUid = signal<string | null>('me');
  readonly tournament = signal<TournamentSummary | null>(tournament());
  readonly tournamentLoaded = signal(true);
  readonly profile = signal(null);
  readonly profileLoaded = signal(true);
  readonly myRegistrations = signal<AthleteTournamentRegistration[]>([]);
  readonly registrationsLoaded = signal(true);
  readonly sentInvites = signal<SentPartnerInvite[]>([invite()]);
  readonly sentInvitesLoaded = signal(true);

  categories(): TournamentCategoryOffer[] {
    return this.tournament()?.categories ?? [];
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
}

describe('RegistrationWaitingComponent', () => {
  let store: FakeStore;
  let navigate: jasmine.Spy;
  let query$: BehaviorSubject<ParamMap>;

  function setup(queryParams: Record<string, string> = { categoria: 'c1' }): void {
    store = new FakeStore();
    navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
    query$ = new BehaviorSubject<ParamMap>(convertToParamMap(queryParams));

    TestBed.configureTestingModule({
      imports: [RegistrationWaitingComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: RegistrationWizardStore, useValue: store as unknown as RegistrationWizardStore },
        { provide: Router, useValue: { navigate } },
        { provide: AuthService, useValue: { user: signal(null), devEmail: signal(null) } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: query$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ id: 't1' }), queryParamMap: query$.value },
          },
        },
      ],
    })
      .overrideComponent(RegistrationWaitingComponent, {
        remove: { imports: [RegistrationWizardShellComponent] },
        add: { imports: [ShellStubComponent] },
      });
  }

  function render() {
    const fixture = TestBed.createComponent(RegistrationWaitingComponent);
    fixture.detectChanges();
    return fixture;
  }

  function lastNavigation(): { commands: unknown[]; extras: { queryParams?: Record<string, string> } } {
    const args = navigate.calls.mostRecent().args;
    return { commands: args[0] as unknown[], extras: (args[1] ?? {}) as { queryParams?: Record<string, string> } };
  }

  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  // O porteiro é quem escolhe uniforme/pagamento/inscrição pronta — aqui só se entrega a
  // inscrição que nasceu do aceite.
  it('leva ao porteiro com a inscrição nova quando o parceiro aceita', () => {
    setup();
    const fixture = render();
    expect(navigate).not.toHaveBeenCalled();

    store.sentInvites.set([invite({ status: 'accepted', registrationId: 'r-nova' })]);
    fixture.detectChanges();
    jasmine.clock().tick(2000);

    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1', registro: 'r-nova' });
  });

  // A callable cria o convite no SERVIDOR: o push do listener pode chegar depois da navegação
  // que trouxe o atleta para cá. Desistir no primeiro build o devolvia ao consentimento — e de
  // lá nada mais reagia ao aceite do parceiro.
  it('espera o convite recém-criado chegar em vez de voltar ao porteiro na hora', () => {
    setup();
    store.sentInvites.set([]);
    const fixture = render();

    expect(navigate).not.toHaveBeenCalled();

    store.sentInvites.set([invite()]);
    fixture.detectChanges();
    jasmine.clock().tick(5000);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('e o aceite que chega depois dessa espera continua movendo o atleta', () => {
    setup();
    store.sentInvites.set([]);
    const fixture = render();

    store.sentInvites.set([invite()]);
    fixture.detectChanges();
    store.sentInvites.set([invite({ status: 'accepted', registrationId: 'r-nova' })]);
    fixture.detectChanges();
    jasmine.clock().tick(2000);

    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1', registro: 'r-nova' });
  });

  // Sem convite nenhum (link direto, categoria errada) a tela não tem notícia a dar: depois da
  // carência, o porteiro decide o destino.
  it('vencida a carência sem convite, volta ao porteiro', () => {
    setup();
    store.sentInvites.set([]);
    render();

    jasmine.clock().tick(3500);

    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1' });
  });
});

@Component({ selector: 'app-registration-wizard-shell', template: '<ng-content /><ng-content select="[wizardActions]" />' })
class ShellStubComponent {
  readonly userName = input('Atleta');
  readonly title = input('');
  readonly subtitle = input<string | null>(null);
  readonly stepNumber = input<number | null>(null);
  readonly closeIcon = input(false);
  readonly back = output<void>();
}
