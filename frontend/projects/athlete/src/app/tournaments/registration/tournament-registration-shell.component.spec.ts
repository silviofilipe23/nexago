import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { MyAthleteProfile } from '../../data/my-athlete-profile-repository';
import type { AthleteTournamentRegistration, SentPartnerInvite } from '../../data/tournament-registrations-repository';
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

function listing(cat: TournamentCategoryOffer, overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 't1',
    name: 'Etapa Teste',
    city: 'Natal',
    location: 'Arena Teste',
    dateLabel: null,
    sport: 'beachVolleyball',
    paymentMode: 'directWithOrganizer',
    requireFormedPair: false,
    categories: [cat],
    ...overrides,
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

/** Convite de dupla pendente esconde a busca de atletas (paridade com o app Flutter):
 *  depois de convidar, o caminho pra chamar outra pessoa é cancelar o convite.
 *  Em EQUIPE nada muda — elenco + convites pendentes já ocupavam as vagas. */
describe('TournamentRegistrationShellComponent — convite de dupla pendente esconde a busca', () => {
  let fixture: ComponentFixture<TournamentRegistrationShellComponent>;

  interface InviteInternals {
    loading: WritableSignal<boolean>;
    listing: WritableSignal<unknown>;
    selectedCategoryId: WritableSignal<string | null>;
    myRegistrations: WritableSignal<AthleteTournamentRegistration[]>;
    sentPendingInvites: WritableSignal<SentPartnerInvite[]>;
    remainingInviteSlots: () => number;
  }
  let cmp: InviteInternals;

  function sentInvite(id = 'inv1'): SentPartnerInvite {
    return { id, inviteeUid: `uid-${id}`, inviteeName: 'Parceiro Teste', expiresAt: null };
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
    cmp = fixture.componentInstance as unknown as InviteInternals;
  });

  afterEach(() => fixture?.destroy());

  /** `sentPendingInvites` entra POR ÚLTIMO: o efeito que alimenta esse signal o zera
   *  sempre que `registration()` muda (sem Firestore nos testes), então o valor fake
   *  só sobrevive se for gravado depois da estabilização. */
  async function render(
    cat: TournamentCategoryOffer,
    reg: AthleteTournamentRegistration,
    invites: SentPartnerInvite[],
  ): Promise<string> {
    cmp.listing.set(listing(cat));
    cmp.selectedCategoryId.set(cat.id);
    cmp.myRegistrations.set([reg]);
    cmp.loading.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.sentPendingInvites.set(invites);
    fixture.detectChanges();
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function searchInput(): Element | null {
    return (fixture.nativeElement as HTMLElement).querySelector('input[type="search"]');
  }

  it('dupla com convite pendente: nenhuma vaga de convite aberta', async () => {
    await render(category(), soloRegistration(), [sentInvite()]);

    expect(cmp.remainingInviteSlots()).toBe(0);
  });

  it('dupla sem convite pendente: uma vaga aberta', async () => {
    await render(category(), soloRegistration(), []);

    expect(cmp.remainingInviteSlots()).toBe(1);
  });

  it('equipe: convites pendentes só descontam do elenco, sem zerar no primeiro convite', async () => {
    const teamCat = category({ teamSize: 3, genderFree: true, genderType: 'Mix' });
    const teamReg = soloRegistration({ teamSize: 3, teamName: 'Trio Teste', captainUid: 'me' });
    await render(teamCat, teamReg, [sentInvite('a')]);

    expect(cmp.remainingInviteSlots()).toBe(1);

    cmp.sentPendingInvites.set([sentInvite('a'), sentInvite('b')]);
    expect(cmp.remainingInviteSlots()).toBe(0);
  });

  it('dupla com convite pendente: busca some e o Cancelar vira o caminho pra trocar de convidado', async () => {
    const text = await render(category(), soloRegistration(), [sentInvite()]);

    expect(searchInput()).toBeNull();
    expect(text).toContain('Convite enviado! Agora é só aguardar a resposta do seu parceiro.');
    expect(text).toContain('Cancele o convite se quiser chamar outro atleta.');
    expect(text).not.toContain('Vaga reservada! Agora busque e convide seu parceiro de dupla.');
    expect(text).not.toContain('Convidar por link');
    // Pagar o integral segue disponível — garante a vaga enquanto o convidado não responde.
    expect(text).toContain('Garantir vaga pagando o valor integral');
  });

  it('dupla sem convite pendente: busca continua na tela com a nota de reserva', async () => {
    const text = await render(category(), soloRegistration(), []);

    expect(searchInput()).not.toBeNull();
    expect(text).toContain('Vaga reservada! Agora busque e convide seu parceiro de dupla.');
  });

  it('dupla paga com convite pendente: nota de vaga garantida aguardando o aceite', async () => {
    const text = await render(category(), soloRegistration({ isPaid: true }), [sentInvite()]);

    expect(searchInput()).toBeNull();
    expect(text).toContain('Vaga garantida! Convite enviado — seu parceiro entra sem taxa assim que aceitar.');
  });
});


/** Torneio que exige dupla já formada: não existe reserva solo — o convite é a entrada, e a
 *  vaga só nasce quando o parceiro aceita (`registerSoloTournament` recusa no servidor). */
describe('TournamentRegistrationShellComponent — torneio de dupla já formada', () => {
  let fixture: ComponentFixture<TournamentRegistrationShellComponent>;

  interface FormedPairInternals {
    loading: WritableSignal<boolean>;
    listing: WritableSignal<unknown>;
    selectedCategoryId: WritableSignal<string | null>;
    myRegistrations: WritableSignal<AthleteTournamentRegistration[]>;
  }
  let cmp: FormedPairInternals;

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
    cmp = fixture.componentInstance as unknown as FormedPairInternals;
  });

  afterEach(() => fixture?.destroy());

  async function render(cat: TournamentCategoryOffer): Promise<string> {
    cmp.listing.set(listing(cat, { requireFormedPair: true }));
    cmp.selectedCategoryId.set(cat.id);
    cmp.myRegistrations.set([]);
    cmp.loading.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  const searchInput = () => (fixture.nativeElement as HTMLElement).querySelector('input[type="search"]');

  it('dupla sem inscrição: troca o CTA de reserva solo pela busca de parceiro', async () => {
    const text = await render(category());

    expect(text).not.toContain('Reservar minha vaga');
    expect(text).toContain('Este torneio exige dupla já formada.');
    expect(searchInput()).not.toBeNull();
  });

  it('dupla sem inscrição: o aceite do termo aparece antes do convite', async () => {
    await render(category());

    expect((fixture.nativeElement as HTMLElement).querySelector('app-lgpd-consent-box')).not.toBeNull();
  });

  it('equipe (trio+) continua criando a equipe pelo nome', async () => {
    const text = await render(category({ teamSize: 4 }));

    expect(text).toContain('Criar equipe e reservar vaga');
    expect(searchInput()).toBeNull();
  });
});
