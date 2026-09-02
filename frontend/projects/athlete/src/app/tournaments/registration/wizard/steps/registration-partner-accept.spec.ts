import { Component, input, output, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import type {
  AthleteTournamentRegistration,
  SentPartnerInvite,
} from '../../../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../../../../data/tournaments-repository';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { RegistrationPartnerComponent } from './registration-partner.component';

@Component({
  selector: 'app-registration-wizard-shell',
  template: '<ng-content /><ng-content select="[wizardActions]" />',
})
class ShellStubComponent {
  readonly userName = input('Atleta');
  readonly title = input('');
  readonly subtitle = input<string | null>(null);
  readonly stepNumber = input<number | null>(null);
  readonly closeIcon = input(false);
  readonly back = output<void>();
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
  } as TournamentCategoryOffer;
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

function invite(overrides: Partial<SentPartnerInvite> = {}): SentPartnerInvite {
  return {
    id: 'i1',
    inviteeUid: 'bruno',
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
  readonly tournament = signal<TournamentSummary | null>({
    id: 't1',
    name: 'Open Teste',
    sport: 'BEACH_TENNIS',
    categories: [offer('c1')],
  } as unknown as TournamentSummary);
  readonly tournamentLoaded = signal(true);
  readonly myRegistrations = signal<AthleteTournamentRegistration[]>([]);
  readonly sentInvites = signal<SentPartnerInvite[]>([]);

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
  pendingSentInvitesFor(id: string | null) {
    return this.sentInvites().filter((i) => i.status === 'pending' && i.tournamentId === 't1' && i.categoryId === id);
  }
  loadRoster() {
    return Promise.resolve([]);
  }
  addOptimisticRegistration(): void {}
}

/** O aceite acontece do OUTRO lado: nenhum gesto nesta tela dispara a releitura, e sem reação ao
 *  snapshot o convidante ficava vendo "aguarde a resposta" com a dupla já formada. */
describe('RegistrationPartnerComponent — aceite do parceiro', () => {
  let store: FakeStore;
  let navigate: jasmine.Spy;
  let query$: BehaviorSubject<ParamMap>;

  function setup(queryParams: Record<string, string> = { categoria: 'c1' }): void {
    store = new FakeStore();
    query$ = new BehaviorSubject<ParamMap>(convertToParamMap(queryParams));

    TestBed.configureTestingModule({
      imports: [RegistrationPartnerComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: RegistrationWizardStore, useValue: store as unknown as RegistrationWizardStore },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: query$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ id: 't1' }), queryParamMap: query$.value },
          },
        },
      ],
    }).overrideComponent(RegistrationPartnerComponent, {
      remove: { imports: [RegistrationWizardShellComponent] },
      add: { imports: [ShellStubComponent] },
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.returnValue(Promise.resolve(true));
  }

  function render() {
    const fixture = TestBed.createComponent(RegistrationPartnerComponent);
    fixture.detectChanges();
    return fixture;
  }

  function lastNavigation(): { commands: unknown[]; extras: { queryParams?: Record<string, string> } } {
    const args = navigate.calls.mostRecent().args;
    return { commands: args[0] as unknown[], extras: (args[1] ?? {}) as { queryParams?: Record<string, string> } };
  }

  it('leva ao porteiro quando o convite em voo é aceito e a dupla fecha', () => {
    setup();
    store.sentInvites.set([invite()]);
    const fixture = render();
    expect(navigate).not.toHaveBeenCalled();

    store.sentInvites.set([invite({ status: 'accepted', registrationId: 'r1' })]);
    store.myRegistrations.set([registration({ id: 'r1', partnerPending: false })]);
    fixture.detectChanges();

    expect(lastNavigation().commands).toEqual(['/torneios', 't1', 'inscricao']);
    expect(lastNavigation().extras.queryParams).toEqual({ categoria: 'c1', registro: 'r1' });
  });

  // Equipe: um "sim" não fecha o elenco, e o lugar do capitão continua sendo esta tela — é
  // daqui que ele chama o próximo.
  it('não tira o capitão da tela enquanto o elenco não fechou', () => {
    setup();
    store.sentInvites.set([invite()]);
    const fixture = render();

    store.sentInvites.set([invite({ status: 'accepted', registrationId: 'r1' })]);
    store.myRegistrations.set([registration({ id: 'r1', partnerPending: true })]);
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
  });

  // Quem volta aqui só para rever a dupla (`?step=parceiro`) não tem convite em voo: mandá-lo
  // de volta ao porteiro seria trancar a porta que ele acabou de abrir.
  it('não mexe em quem chegou com a dupla já formada e nenhum convite em voo', () => {
    setup();
    store.myRegistrations.set([registration({ id: 'r1', partnerPending: false })]);
    store.sentInvites.set([invite({ status: 'accepted', registrationId: 'r1' })]);
    const fixture = render();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
  });
});
