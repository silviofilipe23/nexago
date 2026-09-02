import type { TournamentCategoryOffer } from '../../../data/tournaments-repository';
import type { MyAthleteProfile } from '../../../data/my-athlete-profile-repository';
import { REGISTERED_BADGE, categoryLevelRangeLabel, registrationCategoryStatus } from './registration-category-status';

function offer(overrides: Partial<TournamentCategoryOffer> = {}): TournamentCategoryOffer {
  return {
    id: 'c1',
    categoryName: 'Dupla Masculina B',
    entryFee: 120,
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

const NOW = new Date('2026-09-02T12:00:00Z');

function status(overrides: Parameters<typeof registrationCategoryStatus>[0] extends infer T ? Partial<T> : never = {}) {
  return registrationCategoryStatus({
    category: offer(),
    alreadyRegistered: false,
    spotsLeft: 8,
    profile: null,
    tournamentSport: null,
    tournamentStart: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    now: NOW,
    ...overrides,
  });
}

describe('registrationCategoryStatus', () => {
  // A vaga já é do atleta: bloquear o CTA foi exatamente o beco sem saída que a inscrição solo
  // pendente sofria — quem reservou sem parceiro não tinha como voltar ao convite.
  it('já inscrito vence tudo e NÃO bloqueia', () => {
    const result = status({
      alreadyRegistered: true,
      spotsLeft: 0,
      registrationClosesAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(result.badge).toBe(REGISTERED_BADGE);
    expect(result.blocked).toBeFalse();
  });

  // O prazo vem ANTES da abertura porque é a ordem das checagens da CF.
  it('prazo encerrado bloqueia, mesmo com vaga sobrando', () => {
    const result = status({ registrationClosesAt: new Date('2026-09-01T23:59:00Z') });
    expect(result.badge).toBe('ENCERRADA');
    expect(result.blocked).toBeTrue();
    expect(result.message).toContain('prazo');
  });

  it('prazo no futuro não bloqueia', () => {
    expect(status({ registrationClosesAt: new Date('2026-09-30T23:59:00Z') }).blocked).toBeFalse();
  });

  it('antes da abertura diz QUANDO abre, não que encerrou', () => {
    const result = status({ registrationOpensAt: new Date('2026-09-10T13:00:00Z') });
    expect(result.badge).toBe('EM BREVE');
    expect(result.message).toContain('ainda não abriram');
  });

  it('prazo encerrado vence "em breve"', () => {
    const result = status({
      registrationOpensAt: new Date('2026-09-10T13:00:00Z'),
      registrationClosesAt: new Date('2026-09-01T23:59:00Z'),
    });
    expect(result.badge).toBe('ENCERRADA');
  });

  it('categoria encerrada pelo organizador bloqueia', () => {
    const result = status({ category: offer({ registrationClosed: true }) });
    expect(result.badge).toBe('ENCERRADA');
    expect(result.message).toContain('desta categoria');
  });

  it('sem vaga vira LOTADO', () => {
    expect(status({ spotsLeft: 0 }).badge).toBe('LOTADO');
  });

  // `null` = capacidade desconhecida (sem teto ou contagem não resolvida) — nunca "LOTADO" no
  // escuro.
  it('capacidade desconhecida não vira LOTADO', () => {
    expect(status({ spotsLeft: null }).badge).toBeNull();
  });

  it('perfil ausente deixa a elegibilidade permissiva (o backend segue autoritativo)', () => {
    const result = status({ profile: null });
    expect(result.blocked).toBeFalse();
  });

  it('gênero incompatível bloqueia pela elegibilidade', () => {
    const profile: MyAthleteProfile = {
      gender: 'Feminino',
      birthDate: null,
      level: null,
      levelsBySport: {},
      levelLocked: {},
      fullName: 'Ana',
      nickname: null,
      profilePhotoUrl: null,
    };
    const result = status({ category: offer({ genderType: 'M' }), profile });
    expect(result.blocked).toBeTrue();
  });
});

describe('categoryLevelRangeLabel', () => {
  it('mostra a faixa quando piso e teto diferem', () => {
    expect(categoryLevelRangeLabel({ level: 'Avançado 2', minLevel: 'Intermediário 1' })).toBe(
      'Intermediário 1 – Avançado 2',
    );
  });

  it('com só o teto, mostra o teto', () => {
    expect(categoryLevelRangeLabel({ level: 'Avançado 2', minLevel: null })).toBe('Avançado 2');
  });

  it('com só o piso, mostra o piso', () => {
    expect(categoryLevelRangeLabel({ level: '  ', minLevel: 'Iniciante' })).toBe('Iniciante');
  });

  it('sem nenhum, é Livre', () => {
    expect(categoryLevelRangeLabel({ level: null, minLevel: null })).toBe('Livre');
  });

  it('piso igual ao teto não vira faixa', () => {
    expect(categoryLevelRangeLabel({ level: 'Iniciante', minLevel: 'Iniciante' })).toBe('Iniciante');
  });
});
