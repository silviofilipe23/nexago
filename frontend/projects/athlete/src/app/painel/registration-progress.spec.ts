import {
  EMPTY_UNIFORM_SLOT,
  type AthleteTournamentRegistration,
} from '../data/tournament-registrations-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../data/tournaments-repository';
import { buildInProgressRegistrations, buildRegistrationProgress, partnerUidsOf } from './registration-progress';

const ME = 'uid-eu';
const PARTNER = 'uid-parceiro';

function makeRegistration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'reg-1',
    tournamentId: 't1',
    categoryId: 'cat-1',
    teamId: null,
    partnerPending: true,
    isPaid: false,
    waitlist: false,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: ME,
    participantUids: [ME],
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_UNIFORM_SLOT,
    uniformPlayer2: EMPTY_UNIFORM_SLOT,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<TournamentCategoryOffer> = {}): TournamentCategoryOffer {
  return {
    id: 'cat-1',
    categoryName: 'Masc. Intermediário',
    entryFee: 180,
    maxTeams: 16,
    spotsLeft: 4,
    level: null,
    genderType: 'M',
    bracketFormat: 'groups',
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

function makeTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Open Goiânia Beach',
    city: 'Goiânia',
    location: 'Arena Sol',
    locationAddress: null,
    dateLabel: '12 a 14 ago',
    startAt: new Date('2026-08-12T12:00:00Z'),
    endAt: null,
    format: 'Dupla',
    capacity: 32,
    enrolledCount: 10,
    featured: false,
    liveMatchesNow: 0,
    rawStatus: null,
    isCancelled: false,
    isDraftOrCancelled: false,
    leagueId: null,
    leagueStageId: null,
    leagueStageOrder: null,
    leagueStageName: null,
    coverUrl: null,
    managerId: null,
    regulationsText: null,
    sport: 'BEACH_TENNIS',
    paymentMode: 'appPixCard',
    organizerPix: null,
    waitlistEnabled: false,
    tournamentPrizes: [],
    categories: [makeCategory()],
    ...overrides,
  };
}

function build(
  registration: AthleteTournamentRegistration,
  category = makeCategory(),
  tournament = makeTournament({ categories: [category] }),
  partnerName: string | null = 'Bruno Viana',
) {
  return buildRegistrationProgress({
    registration,
    tournament,
    category,
    myUid: ME,
    myName: 'Marcelo Souza',
    partnerName,
  });
}

/** Categoria com uniforme só de regata, sem número e sem nome na camisa. */
const UNIFORM_CATEGORY = makeCategory({ uniformType: 'top_only', uniformSizeOptionsTop: ['P', 'M', 'G'] });

describe('buildRegistrationProgress', () => {
  it('sem uniforme e sem parceiro: 4 passos, parado na Dupla', () => {
    const progress = build(makeRegistration())!;

    expect(progress.totalSteps).toBe(4);
    expect(progress.currentStep).toBe(2);
    expect(progress.steps.map((s) => s.label)).toEqual(['Categoria', 'Dupla', 'Pagamento', 'Confirmada']);
    expect(progress.steps.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(progress.steps[1].caption).toBe('Falta parceiro');
    expect(progress.ctaLink).toEqual(['/torneios', 't1', 'inscricao']);
    expect(progress.ctaQueryParams).toEqual({ categoria: 'cat-1' });
  });

  it('categoria com uniforme pendente: 5 passos, parado no Uniforme', () => {
    const progress = build(makeRegistration(), UNIFORM_CATEGORY)!;

    expect(progress.totalSteps).toBe(5);
    expect(progress.currentStep).toBe(2);
    expect(progress.steps[1].label).toBe('Uniforme');
    expect(progress.steps[1].caption).toBe('Pendente');
  });

  it('categoria com uniforme salvo: 5 passos, parado na Dupla', () => {
    const registration = makeRegistration({ uniformPlayer1: { ...EMPTY_UNIFORM_SLOT, sizeTop: 'M' } });
    const progress = build(registration, UNIFORM_CATEGORY)!;

    expect(progress.totalSteps).toBe(5);
    expect(progress.currentStep).toBe(3);
    expect(progress.steps[1].caption).toBe('Salvo');
    expect(progress.steps[2].label).toBe('Dupla');
  });

  it('dupla formada e falta pagar: CTA vai pro pagamento com registro e categoria', () => {
    const registration = makeRegistration({
      partnerPending: false,
      participantUids: [ME, PARTNER],
      teamId: 'team-1',
    });
    const progress = build(registration)!;

    expect(progress.currentStep).toBe(3);
    expect(progress.steps[1].caption).toBe('Marcelo & Bruno');
    expect(progress.ctaLink).toEqual(['/torneios', 't1', 'inscricao', 'pagamento']);
    expect(progress.ctaQueryParams).toEqual({ registro: 'reg-1', categoria: 'cat-1' });
  });

  // `\s` de propósito: o Intl pt-BR separa "R$" do valor com espaço não-quebrável (U+00A0),
  // que fica invisível no fonte e quebra comparação literal.
  it('pagamento em aberto mostra a metade da inscrição', () => {
    const progress = build(makeRegistration({ partnerPending: false }))!;

    expect(progress.steps[2].caption).toMatch(/^Sua metade · R\$\s90,00$/);
  });

  it('pagamento direto com o organizador não mostra valor', () => {
    const category = makeCategory();
    const tournament = makeTournament({ paymentMode: 'directWithOrganizer', categories: [category] });
    const progress = build(makeRegistration({ partnerPending: false }), category, tournament)!;

    expect(progress.steps[2].caption).toBe('Direto com o organizador');
  });

  it('categoria gratuita mostra "Gratuito"', () => {
    const category = makeCategory({ entryFee: 0 });
    const progress = build(makeRegistration({ partnerPending: false }), category)!;

    expect(progress.steps[2].caption).toBe('Gratuito');
  });

  it('minha parte paga mas inscrição não fechada: passo Pagamento segue pendente', () => {
    const registration = makeRegistration({ partnerPending: false, sharePaidUids: [ME] });
    const progress = build(registration)!;

    expect(progress.steps[2].caption).toBe('Sua parte paga');
    expect(progress.steps[2].state).toBe('current');
  });

  it('lista de espera continua aparecendo', () => {
    const progress = build(makeRegistration({ waitlist: true }))!;

    expect(progress.waitlist).toBeTrue();
    expect(progress.currentStep).toBe(2);
  });

  it('inscrição concluída não entra no card', () => {
    const registration = makeRegistration({ partnerPending: false, isPaid: true, participantUids: [ME, PARTNER] });

    expect(build(registration)).toBeNull();
  });

  it('estado dos passos é monotônico mesmo com pagamento feito antes do uniforme', () => {
    const registration = makeRegistration({ partnerPending: false, isPaid: true, participantUids: [ME, PARTNER] });
    const progress = build(registration, UNIFORM_CATEGORY)!;

    expect(progress.steps[1].label).toBe('Uniforme');
    expect(progress.steps.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
  });

  it('sendo player2 sem player1Id, lê o uniforme do slot 2', () => {
    const registration = makeRegistration({
      player1Id: null,
      participantUids: [PARTNER, ME],
      partnerPending: false,
      uniformPlayer1: { ...EMPTY_UNIFORM_SLOT, sizeTop: 'G' },
      uniformPlayer2: EMPTY_UNIFORM_SLOT,
    });
    const progress = build(registration, UNIFORM_CATEGORY)!;

    expect(progress.steps[1].label).toBe('Uniforme');
    expect(progress.steps[1].caption).toBe('Pendente');
  });

  it('parceiro sem perfil encontrado não quebra a sublinha da Dupla', () => {
    const registration = makeRegistration({ partnerPending: false, participantUids: [ME, PARTNER] });
    const progress = build(registration, makeCategory(), makeTournament(), null)!;

    expect(progress.steps[1].caption).toBe('Dupla formada');
  });
});

describe('buildInProgressRegistrations', () => {
  it('descarta torneio ou categoria que não resolve e ordena pelo início mais próximo', () => {
    const catA = makeCategory({ id: 'cat-a' });
    const catB = makeCategory({ id: 'cat-b' });
    const tournaments = new Map<string, TournamentSummary>([
      ['t-tarde', makeTournament({ id: 't-tarde', startAt: new Date('2026-09-01T12:00:00Z'), categories: [catA] })],
      ['t-cedo', makeTournament({ id: 't-cedo', startAt: new Date('2026-08-01T12:00:00Z'), categories: [catB] })],
    ]);
    const registrations = [
      makeRegistration({ id: 'r-tarde', tournamentId: 't-tarde', categoryId: 'cat-a' }),
      makeRegistration({ id: 'r-cedo', tournamentId: 't-cedo', categoryId: 'cat-b' }),
      makeRegistration({ id: 'r-orfa', tournamentId: 't-inexistente', categoryId: 'cat-a' }),
      makeRegistration({ id: 'r-cat-removida', tournamentId: 't-cedo', categoryId: 'cat-sumiu' }),
    ];

    const result = buildInProgressRegistrations(registrations, tournaments, ME, 'Marcelo', new Map());

    expect(result.map((r) => r.registrationId)).toEqual(['r-cedo', 'r-tarde']);
  });

  it('descarta inscrição de torneio cancelado, mesmo com passo pendente', () => {
    const cat = makeCategory();
    const tournaments = new Map<string, TournamentSummary>([
      ['t-cancelado', makeTournament({ id: 't-cancelado', isCancelled: true, isDraftOrCancelled: true, categories: [cat] })],
      ['t-ativo', makeTournament({ id: 't-ativo', categories: [cat] })],
    ]);
    const registrations = [
      makeRegistration({ id: 'r-cancelada', tournamentId: 't-cancelado' }),
      makeRegistration({ id: 'r-ativa', tournamentId: 't-ativo' }),
    ];

    const result = buildInProgressRegistrations(registrations, tournaments, ME, 'Marcelo', new Map());

    expect(result.map((r) => r.registrationId)).toEqual(['r-ativa']);
  });

  it('torneio sem data de início vai pro fim da lista', () => {
    const cat = makeCategory();
    const tournaments = new Map<string, TournamentSummary>([
      ['t-sem-data', makeTournament({ id: 't-sem-data', startAt: null, categories: [cat] })],
      ['t-com-data', makeTournament({ id: 't-com-data', startAt: new Date('2026-08-01T12:00:00Z'), categories: [cat] })],
    ]);
    const registrations = [
      makeRegistration({ id: 'r-sem-data', tournamentId: 't-sem-data' }),
      makeRegistration({ id: 'r-com-data', tournamentId: 't-com-data' }),
    ];

    const result = buildInProgressRegistrations(registrations, tournaments, ME, 'Marcelo', new Map());

    expect(result.map((r) => r.registrationId)).toEqual(['r-com-data', 'r-sem-data']);
  });
});

describe('partnerUidsOf', () => {
  it('devolve os uids dos parceiros sem o meu e sem repetir', () => {
    const registrations = [
      makeRegistration({ participantUids: [ME, PARTNER] }),
      makeRegistration({ participantUids: [ME, PARTNER] }),
      makeRegistration({ participantUids: [ME] }),
    ];

    expect(partnerUidsOf(registrations, ME)).toEqual([PARTNER]);
  });
});
