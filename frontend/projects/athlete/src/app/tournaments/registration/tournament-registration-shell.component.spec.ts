import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { MyAthleteProfile } from '../../data/my-athlete-profile-repository';
import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import type { LevelConfirmationPrompt } from '../tournament-eligibility';
import { TournamentRegistrationShellComponent } from './tournament-registration-shell.component';

/** Espelha o profile mínimo já usado nos specs de elegibilidade (`tournament-eligibility.levels.spec.ts`). */
function profile(overrides: Partial<MyAthleteProfile>): MyAthleteProfile {
  return {
    gender: null,
    birthDate: null,
    level: null,
    levelsBySport: {},
    levelLocked: {},
    fullName: null,
    nickname: null,
    profilePhotoUrl: null,
    ...overrides,
  };
}

interface ShellInternals {
  listing: WritableSignal<{ sport: string | null } | null>;
  levelConfirmationPrompt: WritableSignal<LevelConfirmationPrompt | null>;
  fetchLevelGateProfile: () => Promise<MyAthleteProfile | null>;
  ensureLevelConfirmed(): Promise<boolean>;
  confirmLevelPrompt(): void;
  adjustLevelPrompt(): void;
}

/**
 * Gate de confirmação de nível na 1ª inscrição (Task 7) — espelha o app Flutter (Task 6).
 *
 * `auth.user()` fica `null` em TODOS os testes, igual ao padrão já estabelecido em
 * `athlete-sports-levels.component.spec.ts`: os efeitos do construtor (`loadProfile`,
 * `watchMyRegistrations` via `PartnerInvitesService`) dependem de um uid pra disparar
 * qualquer chamada ao Firestore — sem uid, nenhum deles toca rede de verdade. Por isso
 * `fetchLevelGateProfile` (o ponto de fetch do próprio gate) é a única fonte da "resposta
 * do perfil" nestes testes: com o campo trocado, `ensureLevelConfirmed()` roda de ponta a
 * ponta sem depender de sessão nem de Firestore real.
 */
describe('TournamentRegistrationShellComponent — confirmação de nível na 1ª inscrição', () => {
  let fixture: ComponentFixture<TournamentRegistrationShellComponent>;
  let cmp: ShellInternals;
  let router: Router;

  function fakeAuth() {
    return { user: signal(null), devEmail: signal(null) };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentRegistrationShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentRegistrationShellComponent);
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as ShellInternals;
    router = TestBed.inject(Router);
  });

  afterEach(() => fixture?.destroy());

  it('sem falha de resolução (uid/Firestore indisponíveis nos testes): bloqueia e não mostra o dialog', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });

    const confirmed = await cmp.ensureLevelConfirmed();

    expect(confirmed).toBeFalse();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });

  it('esporte já travado: resolve confirmado sem abrir o dialog', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () =>
      Promise.resolve(profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_1' }, levelLocked: { VOLEI_PRAIA: true } }));

    const confirmed = await cmp.ensureLevelConfirmed();

    expect(confirmed).toBeTrue();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });

  it('esporte destravado: abre o dialog com a copy exata e só resolve depois da escolha', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () =>
      Promise.resolve(profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} }));

    let settled: boolean | null = null;
    const pending = cmp.ensureLevelConfirmed().then((v) => {
      settled = v;
      return v;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBeNull();
    expect(cmp.levelConfirmationPrompt()).toEqual({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });

    cmp.confirmLevelPrompt();
    const result = await pending;

    expect(result).toBeTrue();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });

  it('"Ajustar nível": resolve não-confirmado, fecha o dialog e navega pra /perfil/esportes', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () =>
      Promise.resolve(profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} }));
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    const pending = cmp.ensureLevelConfirmed();
    await Promise.resolve();
    await Promise.resolve();

    cmp.adjustLevelPrompt();
    const result = await pending;

    expect(result).toBeFalse();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/perfil/esportes']);
  });

  it('falha ao resolver o perfil: bloqueia (nunca decide no escuro) e não mostra o dialog', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () => Promise.reject(new Error('fetch falhou'));

    const confirmed = await cmp.ensureLevelConfirmed();

    expect(confirmed).toBeFalse();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });
});

/** Estado solo (dupla com `partnerPending`): o atleta pode garantir a vaga pagando o integral. */
describe('TournamentRegistrationShellComponent — pagamento integral na vaga solo', () => {
  let fixture: ComponentFixture<TournamentRegistrationShellComponent>;

  interface SoloInternals {
    loading: WritableSignal<boolean>;
    listing: WritableSignal<unknown>;
    selectedCategoryId: WritableSignal<string | null>;
    myRegistrations: WritableSignal<AthleteTournamentRegistration[]>;
  }
  let cmp: SoloInternals;

  function category(overrides: Partial<TournamentCategoryOffer> = {}): TournamentCategoryOffer {
    return {
      id: 'cat1',
      categoryName: 'Masculino B',
      entryFee: 160,
      maxTeams: 16,
      spotsLeft: 10,
      level: null,
      minLevel: null,
      genderType: 'Masculino',
      teamSize: null,
      genderFree: false,
      genderComposition: null,
      bracketFormat: 'grupos',
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
      ...overrides,
    } as TournamentCategoryOffer;
  }

  function listing(cat: TournamentCategoryOffer): unknown {
    return {
      id: 't1',
      name: 'Etapa Teste',
      city: 'Natal',
      location: 'Arena Teste',
      dateLabel: null,
      sport: 'beachVolleyball',
      paymentMode: 'directWithOrganizer',
      categories: [cat],
    };
  }

  function soloRegistration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
    return {
      id: 'reg1',
      tournamentId: 't1',
      categoryId: 'cat1',
      teamId: null,
      partnerPending: true,
      isPaid: false,
      waitlist: false,
      cancellationRequest: null,
      sharePaidUids: [],
      declaredPaidAt: null,
      paymentVerifiedByOrganizer: false,
      player1Id: 'me',
      participantUids: ['me'],
      lgpdAcceptedUids: [],
      uniformPlayer1: null,
      uniformPlayer2: null,
      teamName: null,
      teamSize: null,
      captainUid: null,
      uniformByUid: {},
      ...overrides,
    } as AthleteTournamentRegistration;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentRegistrationShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(null), devEmail: signal(null) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentRegistrationShellComponent);
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as SoloInternals;
  });

  afterEach(() => fixture?.destroy());

  async function renderSolo(cat: TournamentCategoryOffer, reg: AthleteTournamentRegistration): Promise<string> {
    cmp.listing.set(listing(cat));
    cmp.selectedCategoryId.set(cat.id);
    cmp.myRegistrations.set([reg]);
    cmp.loading.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('solo sem pagar em categoria paga: oferece "Garantir vaga pagando o valor integral"', async () => {
    const text = await renderSolo(category(), soloRegistration());

    expect(text).toContain('Garantir vaga pagando o valor integral');
    expect(text).toContain('Vaga reservada!');
  });

  it('solo em categoria gratuita: sem CTA de pagamento integral', async () => {
    const text = await renderSolo(category({ entryFee: 0 }), soloRegistration());

    expect(text).not.toContain('Garantir vaga pagando o valor integral');
  });

  it('solo que já pagou o total: nota de vaga garantida no lugar do CTA e status próprio', async () => {
    const text = await renderSolo(category(), soloRegistration({ isPaid: true }));

    expect(text).not.toContain('Garantir vaga pagando o valor integral');
    expect(text).toContain('Vaga garantida! Você pagou o valor integral');
    expect(text).toContain('Vaga garantida — falta parceiro');
  });
});
