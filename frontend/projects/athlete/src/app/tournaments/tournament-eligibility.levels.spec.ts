import {
  athleteLevelRank,
  evaluateCategoryEligibility,
  needsLevelConfirmation,
  resolveLevelConfirmationPrompt,
  resolveLevelConfirmationPromptForTournament,
  tournamentSportToLevelSportCode,
} from './tournament-eligibility';
import type { MyAthleteProfile } from '../data/my-athlete-profile-repository';
import type { TournamentCategoryOffer } from '../data/tournaments-repository';

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

function offer(overrides: Partial<TournamentCategoryOffer>): TournamentCategoryOffer {
  return {
    id: 'cat-1',
    categoryName: 'Categoria teste',
    entryFee: 0,
    maxTeams: 16,
    spotsLeft: 16,
    level: null,
    minLevel: null,
    genderType: 'Mix',
    teamSize: null,
    genderFree: false,
    genderComposition: null,
    bracketFormat: 'single elimination',
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

describe('tournamentSportToLevelSportCode', () => {
  it('mapeia todos os esportes de torneio para o código do perfil', () => {
    expect(tournamentSportToLevelSportCode('beachVolleyball')).toBe('VOLEI_PRAIA');
    expect(tournamentSportToLevelSportCode('indoorVolleyball')).toBe('VOLEI_QUADRA');
    expect(tournamentSportToLevelSportCode('footvolley')).toBe('FUTEVOLEI');
    expect(tournamentSportToLevelSportCode('beachTennis')).toBe('BEACH_TENNIS');
    expect(tournamentSportToLevelSportCode('xadrez')).toBeNull();
    expect(tournamentSportToLevelSportCode(null)).toBeNull();
  });
});

describe('athleteLevelRank (por esporte → global → 0)', () => {
  it('usa o nível de FUTEVOLEI em torneios de footvolley', () => {
    const p = profile({
      level: 'Iniciante 1',
      levelsBySport: { FUTEVOLEI: 'intermediario_2' },
    });
    expect(athleteLevelRank(p, 'footvolley')).toBe(3);
  });

  it('cai no nível global quando o esporte não tem entrada', () => {
    const p = profile({ level: 'Open', levelsBySport: { VOLEI_PRAIA: 'iniciante_1' } });
    expect(athleteLevelRank(p, 'footvolley')).toBe(6);
  });

  it('sem nada → 0 (permissivo)', () => {
    expect(athleteLevelRank(profile({}), 'footvolley')).toBe(0);
    expect(athleteLevelRank(null, 'footvolley')).toBe(0);
  });
});

describe('evaluateCategoryEligibility — piso de nível (minLevel)', () => {
  it('piso: Intermediário 2 é barrado da Elite (mín. Avançado 1), Avançado 1 entra', () => {
    const elite = offer({ level: 'Open', minLevel: 'Avançado 1' });
    const int2 = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_2' } });
    const av1 = profile({ levelsBySport: { VOLEI_PRAIA: 'avancado_1' } });
    const opts = { tournamentSport: 'beachVolleyball', tournamentStart: null };
    expect(evaluateCategoryEligibility(elite, int2, opts).status).toBe('belowMinLevel');
    expect(evaluateCategoryEligibility(elite, av1, opts).status).toBe('eligible');
  });

  it('sem minLevel nada muda (retrocompat)', () => {
    const livre = offer({ level: 'Open', minLevel: null });
    const ini = profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' } });
    expect(evaluateCategoryEligibility(livre, ini, { tournamentSport: 'beachVolleyball', tournamentStart: null }).status).toBe(
      'eligible',
    );
  });

  // Regressão do Task 6: a mensagem de teto (belowLevel) combinava o `levelLabelForRank` COMPARTILHADO
  // (7 degraus) com o rank do atleta calculado pela escada LOCAL de 5 degraus — um atleta Open (rank
  // local 5) virava "Avançado 2" na mensagem. Corrigido ao levar o espelho local pra 7 degraus.
  it('regressão: atleta Open abaixo do teto vê "Open" na mensagem de belowLevel, não "Avançado 2"', () => {
    const categoriaBaixa = offer({ level: 'Intermediário 1' });
    const atletaOpen = profile({ levelsBySport: { VOLEI_PRAIA: 'open' } });
    const result = evaluateCategoryEligibility(categoriaBaixa, atletaOpen, {
      tournamentSport: 'beachVolleyball',
      tournamentStart: null,
    });
    expect(result.status).toBe('belowLevel');
    expect(result.message).toContain('Open');
    expect(result.message).not.toContain('Avançado 2');
  });
});

// Task 7 — confirmação de nível na 1ª inscrição do esporte. Espelha
// `CategoryLevelEligibility.needsLevelConfirmation`/`resolveLevelConfirmationPrompt`
// (Flutter, Task 6): gate puro + wrapper async que AWAITA o perfil antes de decidir.
describe('needsLevelConfirmation — gate puro da 1ª inscrição', () => {
  it('esporte já travado (levelLocked[sportCode] === true) → false, nunca mais pede', () => {
    const p = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_1' }, levelLocked: { VOLEI_PRAIA: true } });
    expect(needsLevelConfirmation(p, 'beachVolleyball')).toBeFalse();
  });

  it('esporte mapeado e destravado → true', () => {
    const p = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_1' }, levelLocked: {} });
    expect(needsLevelConfirmation(p, 'beachVolleyball')).toBeTrue();
  });

  it('esporte do torneio sem equivalente no perfil (sportCode null) → false', () => {
    const p = profile({});
    expect(needsLevelConfirmation(p, 'xadrez')).toBeFalse();
    expect(needsLevelConfirmation(p, null)).toBeFalse();
  });

  it('perfil nulo → false (sem dado não dá pra confirmar; backend segue autoritativo)', () => {
    expect(needsLevelConfirmation(null, 'beachVolleyball')).toBeFalse();
  });
});

describe('resolveLevelConfirmationPrompt — awaita o Future do perfil antes de decidir (espelha o fix I1 da Task 6)', () => {
  it('não decide enquanto o Future do perfil está pendente — só resolve depois do profileFuture resolver', async () => {
    let resolveProfile!: (p: MyAthleteProfile | null) => void;
    const pending = new Promise<MyAthleteProfile | null>((resolve) => {
      resolveProfile = resolve;
    });
    let settled = false;
    const promptFuture = resolveLevelConfirmationPrompt(pending, 'beachVolleyball').then((v: unknown) => {
      settled = true;
      return v;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBeFalse();

    resolveProfile(profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} }));
    const result = await promptFuture;

    expect(settled).toBeTrue();
    expect(result).toEqual({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });
  });

  it('esporte travado → null (sem prompt)', async () => {
    const p = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_1' }, levelLocked: { VOLEI_PRAIA: true } });
    const result = await resolveLevelConfirmationPrompt(Promise.resolve(p), 'beachVolleyball');
    expect(result).toBeNull();
  });

  it('perfil ausente (Future resolve null) → null', async () => {
    const result = await resolveLevelConfirmationPrompt(Promise.resolve(null), 'beachVolleyball');
    expect(result).toBeNull();
  });

  it('erro no Future propaga pro chamador — quem decide bloquear é quem chama', async () => {
    const boom = Promise.reject(new Error('fetch falhou'));
    await expectAsync(resolveLevelConfirmationPrompt(boom, 'beachVolleyball')).toBeRejectedWithError('fetch falhou');
  });
});

// Fix pós-review (I1): 3 dos 6 pontos de entrada descobrem o esporte do torneio pelo cache de
// `PartnerInvitesService.pending()`, cujo contrato deixa `tournament: null` enquanto o fetch
// paralelo ainda não voltou (`partner-invites.service.ts:24-27`). Ler esse valor direto tratava
// "ainda não sei o esporte" como "sem esporte mapeado" e pulava o gate em silêncio — a MESMA
// falha que a Task 6 (Flutter) cometeu no aceite de convite, só que na resolução do TORNEIO em
// vez da do PERFIL. `resolveLevelConfirmationPromptForTournament` busca os dois FRESCOS.
describe('resolveLevelConfirmationPromptForTournament — awaita perfil E torneio antes de decidir', () => {
  it('não decide enquanto qualquer um dos dois Futures está pendente', async () => {
    let resolveProfile!: (p: MyAthleteProfile | null) => void;
    let resolveTournament!: (t: { sport: string | null } | null) => void;
    const profileFuture = new Promise<MyAthleteProfile | null>((resolve) => {
      resolveProfile = resolve;
    });
    const tournamentFuture = new Promise<{ sport: string | null } | null>((resolve) => {
      resolveTournament = resolve;
    });
    let settled = false;
    const promptFuture = resolveLevelConfirmationPromptForTournament(profileFuture, tournamentFuture).then(
      (v: unknown) => {
        settled = true;
        return v;
      },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBeFalse();

    // Perfil chega primeiro; sem o torneio ainda não decide.
    resolveProfile(profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} }));
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBeFalse();

    resolveTournament({ sport: 'beachVolleyball' });
    const result = await promptFuture;

    expect(settled).toBeTrue();
    expect(result).toEqual({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });
  });

  it('torneio travado (esporte já com levelLocked) → null', async () => {
    const p = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_1' }, levelLocked: { VOLEI_PRAIA: true } });
    const result = await resolveLevelConfirmationPromptForTournament(
      Promise.resolve(p),
      Promise.resolve({ sport: 'beachVolleyball' }),
    );
    expect(result).toBeNull();
  });

  it('torneio genuinamente ausente (fetch fresco resolve null, ex.: torneio apagado) → null, sem travar', async () => {
    const p = profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} });
    const result = await resolveLevelConfirmationPromptForTournament(Promise.resolve(p), Promise.resolve(null));
    expect(result).toBeNull();
  });

  it('falha ao buscar o TORNEIO propaga pro chamador (quem decide bloquear é quem chama)', async () => {
    const boom = Promise.reject(new Error('torneio: fetch falhou'));
    await expectAsync(
      resolveLevelConfirmationPromptForTournament(Promise.resolve(profile({})), boom),
    ).toBeRejectedWithError('torneio: fetch falhou');
  });

  it('falha ao buscar o PERFIL propaga pro chamador', async () => {
    const boom = Promise.reject(new Error('perfil: fetch falhou'));
    await expectAsync(
      resolveLevelConfirmationPromptForTournament(boom, Promise.resolve({ sport: 'beachVolleyball' })),
    ).toBeRejectedWithError('perfil: fetch falhou');
  });
});
