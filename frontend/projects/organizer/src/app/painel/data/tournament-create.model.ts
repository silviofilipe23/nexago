/** Porta fiel de `tournament_create_draft.dart` + `tournament_create_logic.dart` (Flutter):
 *  o rascunho do wizard de criação de torneio e suas regras de validação/rótulos. Os VALORES
 *  string dos "enums" são os `name` dos enums Dart — é o que vai pro Firestore, então não
 *  renomear. */

export type TournamentSport = 'beachVolleyball' | 'indoorVolleyball' | 'footvolley';
export type TournamentBracketSystem = 'groupsThenKnockout' | 'singleElimination' | 'roundRobin' | 'groupsWithRepechage' | 'doubleElimination' | 'kingOfCourt';
export type TournamentBestOf = 'singleSet' | 'bestOf3' | 'bestOf5';
export type TournamentPaymentMode = 'appPixCard' | 'directWithOrganizer';
export type TournamentVisibility = 'publicListing' | 'linkOnly';
export type CategoryGender = 'male' | 'female' | 'mixed';
/** `team` é legado (nunca foi oferecido na UI); os formatos de equipe reais são trio/quarteto/quinteto. */
export type CategoryDispute = 'individual' | 'dupla' | 'trio' | 'quarteto' | 'quinteto' | 'team';
export type AgeBand =
  | 'open'
  | 'sub13'
  | 'sub15'
  | 'sub17'
  | 'sub19'
  | 'sub21'
  | 'sub23'
  | 'plus30'
  | 'plus35'
  | 'plus40'
  | 'plus45'
  | 'plus50'
  | 'plus55'
  | 'plus60';
export type SkillLevel =
  | 'beginner'
  | 'intermediate'
  | 'open'
  | 'iniciante1'
  | 'iniciante2'
  | 'intermediario1'
  | 'intermediario2'
  | 'avancado1'
  | 'avancado2';
export type AgeReference = 'tournamentStart' | 'yearEnd' | 'registration';

export interface CategoryPrizeDraft {
  position: string;
  valueCents: number;
  label?: string;
}

export interface TournamentCategoryDraft {
  id: string;
  name: string;
  gender: CategoryGender;
  dispute: CategoryDispute;
  /** Equipe (trio+) sem restrição de gênero — o `gender` fica `mixed` só para exibição legada. */
  genderFree: boolean;
  /** Composição exata (equipe mista): homens + mulheres = tamanho da equipe. */
  menCount: number;
  womenCount: number;
  ageBand: AgeBand;
  skillLevel: SkillLevel;
  /** Nível mínimo da faixa (preset "Elite" etc.) — `null` = sem piso, categorias sem faixa. */
  minSkillLevel: SkillLevel | null;
  ageReference: AgeReference;
  ageCustomEnabled: boolean;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  spots: number;
  useDefaultPrice: boolean;
  priceCents: number;
  bracketSystem: TournamentBracketSystem;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  /** Config do King of the Court (`teamsPerCourt`/`qualifiersPerRound`/
   *  `roundDurationSec` no doc). Gravada sempre, e não só quando o formato é
   *  KOTC, para o roundtrip de edição não perder a escolha de quem troca de
   *  formato e volta — `resolveKocConfig` no backend lê esses nomes. */
  kocTeamsPerCourt: number;
  kocQualifiersPerRound: number;
  kocRoundDurationSec: number;
  bestOf: TournamentBestOf;
  finalBestOf5: boolean;
  maxRegistrationsPerAthlete: number;
  prizes: CategoryPrizeDraft[];
}

export interface TournamentCreateDraft {
  tournamentId: string | null;
  sport: TournamentSport;
  name: string;
  coverImageUrl: string | null;
  description: string;
  arenaId: string | null;
  locationName: string;
  locationAddress: string;
  city: string;
  state: string;
  startAt: Date | null;
  endAt: Date | null;
  firstMatchAt: Date | null;
  courtsCount: number;
  categories: TournamentCategoryDraft[];
  defaultPriceCents: number;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  paymentMode: TournamentPaymentMode;
  organizerPixKey: string;
  organizerPixKeyType: string;
  organizerPixRecipientName: string;
  organizerPixCity: string;
  waitlistEnabled: boolean;
  /** Vaga sem pagamento é liberada depois do prazo de garantia. */
  registrationHoldEnabled: boolean;
  /** Minutos de garantia da vaga depois que o elenco fecha. */
  registrationHoldMinutes: number;
  inviteConfirmEnabled: boolean;
  /** Sem inscrição individual: em categoria de dupla a vaga só nasce quando o parceiro aceita o
   *  convite. Lido pela Cloud Function `registerSoloTournament`, que recusa a reserva solo. */
  requireFormedPair: boolean;
  cashPrizesEnabled: boolean;
  regulationNotes: string;
  uniformRequired: boolean;
  uniformNumberOnShirt: boolean;
  uniformNameOnShirt: boolean;
  rankingEnabled: boolean;
  rankingTableId: string;
  visibility: TournamentVisibility;
  /** O atleta vê a lista de equipes inscritas (tela no app, aba no portal). Desligar esconde a
   *  lista nas duas superfícies, não a contagem de inscritos. */
  enrolledTeamsVisible: boolean;
}

export function emptyCategoryDraft(id: string): TournamentCategoryDraft {
  return {
    id,
    name: '',
    gender: 'male',
    dispute: 'dupla',
    genderFree: false,
    menCount: 2,
    womenCount: 1,
    ageBand: 'open',
    skillLevel: 'open',
    // Preset "Livre" (iniciante1–open) — categoria nova nasce com chip ativo e piso EXPLÍCITO,
    // nunca em `null` (marca reservada pra faixa legada — ver `CATEGORY_LEVEL_PRESETS`).
    minSkillLevel: 'iniciante1',
    ageReference: 'tournamentStart',
    ageCustomEnabled: false,
    ageMinYears: null,
    ageMaxYears: null,
    spots: 16,
    useDefaultPrice: true,
    priceCents: 18000,
    bracketSystem: 'groupsThenKnockout',
    teamsPerGroup: 4,
    qualifiersPerGroup: 2,
    kocTeamsPerCourt: KOC_DEFAULT_TEAMS_PER_COURT,
    kocQualifiersPerRound: KOC_DEFAULT_QUALIFIERS_PER_ROUND,
    kocRoundDurationSec: KOC_DEFAULT_ROUND_DURATION_SEC,
    // Padrão do NexaGO: partida de set único (MD3/MD5 são escolha explícita).
    bestOf: 'singleSet',
    finalBestOf5: false,
    maxRegistrationsPerAthlete: 2,
    prizes: [],
  };
}

export function emptyTournamentDraft(): TournamentCreateDraft {
  return {
    tournamentId: null,
    sport: 'beachVolleyball',
    name: '',
    coverImageUrl: null,
    description: '',
    arenaId: null,
    locationName: '',
    locationAddress: '',
    city: '',
    state: '',
    startAt: null,
    endAt: null,
    firstMatchAt: null,
    courtsCount: 4,
    categories: [],
    defaultPriceCents: 22000,
    registrationOpensAt: null,
    registrationClosesAt: null,
    paymentMode: 'appPixCard',
    organizerPixKey: '',
    organizerPixKeyType: '',
    organizerPixRecipientName: '',
    organizerPixCity: '',
    waitlistEnabled: true,
    registrationHoldEnabled: true,
    registrationHoldMinutes: 30,
    inviteConfirmEnabled: false,
    requireFormedPair: false,
    cashPrizesEnabled: true,
    regulationNotes: '',
    uniformRequired: true,
    uniformNumberOnShirt: true,
    uniformNameOnShirt: true,
    rankingEnabled: true,
    rankingTableId: 'nexago_standalone',
    visibility: 'publicListing',
    enrolledTeamsVisible: true,
  };
}

// ── Rótulos (mesmos textos do app) ────────────────────────────────────────────

export const SPORT_LABEL: Record<TournamentSport, string> = {
  beachVolleyball: 'Vôlei de praia',
  indoorVolleyball: 'Vôlei de quadra',
  footvolley: 'Futevôlei',
};

export const BRACKET_SYSTEM_LABEL: Record<TournamentBracketSystem, string> = {
  groupsThenKnockout: 'Fase de grupos + mata-mata',
  singleElimination: 'Mata-mata (chave simples)',
  roundRobin: 'Todos contra todos',
  groupsWithRepechage: 'Grupos + repescagem',
  doubleElimination: 'Dupla eliminatória',
  kingOfCourt: 'King of the Court',
};

export const BRACKET_SYSTEM_SHORT_LABEL: Record<TournamentBracketSystem, string> = {
  groupsThenKnockout: 'Grupos + SE',
  singleElimination: 'Chave simples',
  roundRobin: 'Pontos corridos',
  groupsWithRepechage: 'Grupos + repescagem',
  doubleElimination: 'Dupla eliminatória',
  kingOfCourt: 'King of the Court',
};

export const BRACKET_SYSTEM_DESCRIPTION: Record<TournamentBracketSystem, string> = {
  groupsThenKnockout: 'Grupos classificatórios e depois eliminatória. O mais comum em torneios de praia.',
  singleElimination: 'Eliminação direta do início ao fim.',
  roundRobin: 'Pontos corridos — todos se enfrentam.',
  groupsWithRepechage: 'Quem perde cedo ganha uma segunda chance.',
  doubleElimination: 'Dupla eliminatória — sem fase de grupos.',
  kingOfCourt: 'Rodadas de 3 a 5 duplas na mesma quadra. Só quem está no trono pontua.',
};

/** Formatos com geração de chave implementada (mesma lista do app). */
export const SUPPORTED_BRACKET_SYSTEMS: readonly TournamentBracketSystem[] = ['groupsThenKnockout', 'singleElimination', 'doubleElimination', 'kingOfCourt'];

export const BEST_OF_LABEL: Record<TournamentBestOf, string> = {
  singleSet: 'Set único',
  bestOf3: 'MD3',
  bestOf5: 'MD5',
};

/** Prazos oferecidos no wizard. Valor gravado é sempre em MINUTOS. */
export const REGISTRATION_HOLD_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 15, label: '15 minutos' },
  { minutes: 30, label: '30 minutos' },
  { minutes: 60, label: '1 hora' },
  { minutes: 120, label: '2 horas' },
  { minutes: 1440, label: '24 horas' },
];

export function registrationHoldLabel(minutes: number): string {
  return REGISTRATION_HOLD_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} minutos`;
}

export const GENDER_LABEL: Record<CategoryGender, string> = { male: 'Masculino', female: 'Feminino', mixed: 'Misto' };
export const GENDER_SHORT: Record<CategoryGender, string> = { male: 'Masc', female: 'Fem', mixed: 'Misto' };

// ── Disputa / equipes (trio · quarteto · quinteto) ────────────────────────────

export const DISPUTE_LABEL: Record<CategoryDispute, string> = {
  individual: 'Individual',
  dupla: 'Dupla',
  trio: 'Trio',
  quarteto: 'Quarteto',
  quinteto: 'Quinteto',
  team: 'Equipe',
};

export const DISPUTE_TEAM_SIZE: Record<CategoryDispute, number> = {
  individual: 1,
  dupla: 2,
  trio: 3,
  quarteto: 4,
  quinteto: 5,
  team: 2,
};

/** Formatos oferecidos no builder (individual/`team` legado ficam de fora). */
export const DISPUTE_OPTIONS: readonly CategoryDispute[] = ['dupla', 'trio', 'quarteto', 'quinteto'];

/** Categoria de equipe nomeada (trio+) — dupla segue o fluxo clássico. */
export function isTeamDispute(dispute: CategoryDispute): boolean {
  return DISPUTE_TEAM_SIZE[dispute] >= 3;
}

export function categoryTeamSize(category: TournamentCategoryDraft): number {
  return DISPUTE_TEAM_SIZE[category.dispute] ?? 2;
}

/** Unidade das vagas ("16 duplas" / "8 equipes"). */
export function categoryUnitLabel(category: TournamentCategoryDraft): string {
  if (category.dispute === 'individual') return 'atletas';
  return isTeamDispute(category.dispute) ? 'equipes' : 'duplas';
}

export function categoryUnitSingular(category: TournamentCategoryDraft): string {
  if (category.dispute === 'individual') return 'atleta';
  return isTeamDispute(category.dispute) ? 'equipe' : 'dupla';
}

/** Composição exata gravada no doc, ou `null` (dupla ou equipe livre). */
export function categoryGenderComposition(category: TournamentCategoryDraft): { men: number; women: number } | null {
  if (!isTeamDispute(category.dispute) || category.genderFree) return null;
  const size = categoryTeamSize(category);
  if (category.gender === 'male') return { men: size, women: 0 };
  if (category.gender === 'female') return { men: 0, women: size };
  return { men: category.menCount, women: category.womenCount };
}

/** "2H + 2M" — rótulo curto da composição mista. */
export function genderCompositionShort(category: TournamentCategoryDraft): string | null {
  const comp = categoryGenderComposition(category);
  if (!comp || comp.men === 0 || comp.women === 0) return null;
  return `${comp.men}H + ${comp.women}M`;
}

/** Rebalanceia a composição ao trocar disputa/gênero: soma sempre = tamanho, misto com ≥1 de cada. */
export function normalizeCategoryComposition(category: TournamentCategoryDraft): TournamentCategoryDraft {
  if (!isTeamDispute(category.dispute)) return category;
  const size = categoryTeamSize(category);
  if (category.gender === 'male' && !category.genderFree) return { ...category, menCount: size, womenCount: 0 };
  if (category.gender === 'female' && !category.genderFree) return { ...category, menCount: 0, womenCount: size };
  const men = Math.min(Math.max(category.menCount, 1), size - 1);
  return { ...category, menCount: men, womenCount: size - men };
}

/** Misto exato precisa de ≥1 homem e ≥1 mulher somando o tamanho da equipe. */
export function categoryCompositionValid(category: TournamentCategoryDraft): boolean {
  if (!isTeamDispute(category.dispute) || category.genderFree || category.gender !== 'mixed') return true;
  return (
    category.menCount >= 1 &&
    category.womenCount >= 1 &&
    category.menCount + category.womenCount === categoryTeamSize(category)
  );
}

export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  open: 'Livre',
  sub13: 'Sub-13',
  sub15: 'Sub-15',
  sub17: 'Sub-17',
  sub19: 'Sub-19',
  sub21: 'Sub-21',
  sub23: 'Sub-23',
  plus30: '+30',
  plus35: '+35',
  plus40: '+40',
  plus45: '+45',
  plus50: '+50',
  plus55: '+55',
  plus60: '+60',
};

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  open: 'Open',
  iniciante1: 'Iniciante 1',
  iniciante2: 'Iniciante 2',
  intermediario1: 'Intermediário 1',
  intermediario2: 'Intermediário 2',
  avancado1: 'Avançado 1',
  avancado2: 'Avançado 2',
};

/** Escada única de 7 níveis para categorias novas de TODOS os esportes.
 *  Os membros legados de `SkillLevel` (`beginner`/`intermediate`) seguem no
 *  tipo só pra reabrir categorias antigas — o editor não os oferece mais. */
export function skillLevelOptionsForSport(sport: TournamentSport): SkillLevel[] {
  return ['iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2', 'open'];
}

export interface CategoryLevelPreset {
  label: string;
  min: SkillLevel;
  max: SkillLevel;
}

/** Faixas prontas de nível (spec emendada 18/08). "Open" é a faixa-ponte
 *  4–6 que fecha chave com topo pequeno; "Elite" é só o degrau Open (topo).
 *  "Livre" grava piso EXPLÍCITO iniciante1 — `minLevel` ausente no doc é
 *  marca de categoria LEGADA (regra antiga só-teto), nunca um preset. */
export const CATEGORY_LEVEL_PRESETS: readonly CategoryLevelPreset[] = [
  { label: 'Iniciante', min: 'iniciante1', max: 'iniciante2' },
  { label: 'Intermediário', min: 'intermediario1', max: 'intermediario2' },
  { label: 'Avançado', min: 'avancado1', max: 'avancado2' },
  { label: 'Open', min: 'avancado1', max: 'open' },
  { label: 'Elite', min: 'open', max: 'open' },
  { label: 'Livre', min: 'iniciante1', max: 'open' },
];

// ── King of the Court ─────────────────────────────────────────────────────────
// Porta de `king_of_court_plan.dart`, que por sua vez espelha
// `functions/src/koc-bracket-builders.ts` — a FONTE DA VERDADE é o backend. Aqui
// a conta serve para o wizard responder, antes de publicar, a pergunta que o
// organizador realmente tem: *cabe na minha reserva de quadra?*

export const KOC_MIN_TEAMS_PER_ROUND = 3;
export const KOC_MAX_TEAMS_PER_ROUND = 5;
export const KOC_DEFAULT_TEAMS_PER_COURT = 4;
export const KOC_DEFAULT_QUALIFIERS_PER_ROUND = 2;
export const KOC_DEFAULT_ROUND_DURATION_SEC = 900;
export const KOC_MIN_ROUND_DURATION_SEC = 300;
export const KOC_MAX_ROUND_DURATION_SEC = 2400;
/** Abaixo disso a rodada fica rasa para uma classificatória (~12 rallies por dupla). */
export const KOC_SHALLOW_ROUND_DURATION_SEC = 600;
const KOC_CHANGEOVER_SEC = 300;
/** Descanso mínimo de quem se classifica na última rodada e entra na primeira semi. */
const KOC_PHASE_BREAK_SEC = 900;
const KOC_MAX_PHASES = 6;

/** Em quantas rodadas dividir `teamCount` duplas; 0 = não fecha uma rodada. */
export function kocRoundCount(teamCount: number, teamsPerCourt: number): number {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) return 0;
  const perCourt = Math.min(KOC_MAX_TEAMS_PER_ROUND, Math.max(KOC_MIN_TEAMS_PER_ROUND, Math.floor(teamsPerCourt)));
  let rounds = Math.max(1, Math.ceil(teamCount / perCourt));
  // Rodada de 2 não é King of the Court: junta em vez de deixar malformada.
  while (rounds > 1 && Math.floor(teamCount / rounds) < KOC_MIN_TEAMS_PER_ROUND) rounds--;
  while (Math.ceil(teamCount / rounds) > KOC_MAX_TEAMS_PER_ROUND) rounds++;
  return rounds;
}

/** Rodadas de cada fase, da classificatória à final. Vazio = config não fecha. */
export function kocRoundsPerPhase(teamCount: number, teamsPerCourt: number, qualifiersPerRound: number): number[] {
  const qualifiers = Math.max(1, Math.floor(qualifiersPerRound));
  const phases: number[] = [];
  let fieldSize = teamCount;
  while (phases.length < KOC_MAX_PHASES) {
    const rounds = kocRoundCount(fieldSize, teamsPerCourt);
    if (rounds === 0) return [];
    phases.push(rounds);
    if (rounds === 1) return phases;
    const next = rounds * qualifiers;
    // Fase que não reduz o campo entraria em laço na geração.
    if (next >= fieldSize) return [];
    fieldSize = next;
  }
  return [];
}

export interface KocSchedule {
  roundsPerPhase: number[];
  totalRounds: number;
  totalSeconds: number;
  /** "2h35" / "45min" — o número que responde se cabe na reserva da quadra. */
  totalLabel: string;
  valid: boolean;
}

export function kocSchedule(teamCount: number, teamsPerCourt: number, qualifiersPerRound: number, roundDurationSec: number, courts = 1): KocSchedule {
  const roundsPerPhase = kocRoundsPerPhase(teamCount, teamsPerCourt, qualifiersPerRound);
  if (roundsPerPhase.length === 0) {
    return {roundsPerPhase: [], totalRounds: 0, totalSeconds: 0, totalLabel: '', valid: false};
  }
  const parallel = Math.max(1, courts);
  const duration = Math.min(KOC_MAX_ROUND_DURATION_SEC, Math.max(KOC_MIN_ROUND_DURATION_SEC, Math.round(roundDurationSec)));
  let seconds = 0;
  for (let i = 0; i < roundsPerPhase.length; i++) {
    const waves = Math.ceil(roundsPerPhase[i] / parallel);
    seconds += waves * duration + (waves - 1) * KOC_CHANGEOVER_SEC;
    if (i < roundsPerPhase.length - 1) seconds += KOC_PHASE_BREAK_SEC;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const totalLabel = hours === 0 ? `${minutes}min` : minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
  return {
    roundsPerPhase,
    totalRounds: roundsPerPhase.reduce((a, b) => a + b, 0),
    totalSeconds: seconds,
    totalLabel,
    valid: true,
  };
}

export const BRACKET_FORMAT_FIRESTORE: Record<TournamentBracketSystem, string> = {
  groupsThenKnockout: 'groups_knockout',
  singleElimination: 'single_elimination',
  roundRobin: 'round_robin',
  groupsWithRepechage: 'groups_repechage',
  doubleElimination: 'double_elimination',
  kingOfCourt: 'king_of_court',
};

export function bracketSystemFromRaw(raw: string): TournamentBracketSystem | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const byName: Record<string, TournamentBracketSystem> = {
    groupsThenKnockout: 'groupsThenKnockout',
    singleElimination: 'singleElimination',
    roundRobin: 'roundRobin',
    groupsWithRepechage: 'groupsWithRepechage',
    doubleElimination: 'doubleElimination',
    kingOfCourt: 'kingOfCourt',
    groups_knockout: 'groupsThenKnockout',
    groups_then_knockout: 'groupsThenKnockout',
    single_elimination: 'singleElimination',
    round_robin: 'roundRobin',
    groups_repechage: 'groupsWithRepechage',
    groups_with_repechage: 'groupsWithRepechage',
    double_elimination: 'doubleElimination',
    king_of_court: 'kingOfCourt',
    kotc: 'kingOfCourt',
  };
  const exact = byName[trimmed] ?? byName[trimmed.toLowerCase()];
  if (exact) return exact;
  const n = trimmed.toLowerCase();
  if (n.includes('pool') && (n.includes('se') || n.includes('mata') || n.includes('elim'))) return 'groupsThenKnockout';
  if (n.includes('grupos') && n.includes('mata')) return 'groupsThenKnockout';
  if (n.includes('dupla') && n.includes('elim')) return 'doubleElimination';
  return null;
}

export function suggestCategoryName(category: TournamentCategoryDraft): string {
  const parts: string[] = [];
  if (isTeamDispute(category.dispute)) {
    parts.push(DISPUTE_LABEL[category.dispute]);
    parts.push(category.genderFree ? 'Livre' : GENDER_LABEL[category.gender]);
  } else {
    parts.push(GENDER_LABEL[category.gender]);
  }
  if (category.ageBand !== 'open') parts.push(AGE_BAND_LABEL[category.ageBand]);
  if (category.minSkillLevel != null && category.minSkillLevel === category.skillLevel) {
    // Faixa de um único degrau (preset "Elite": min = max) — rótulo simples, sem "mín.".
    parts.push(SKILL_LEVEL_LABEL[category.skillLevel]);
  } else {
    if (category.skillLevel !== 'open') parts.push(SKILL_LEVEL_LABEL[category.skillLevel]);
    // Piso rank 0 (iniciante1) é o preset "Livre" — piso padrão, sem ruído no nome.
    if (category.minSkillLevel && category.minSkillLevel !== 'iniciante1') {
      parts.push(`mín. ${SKILL_LEVEL_LABEL[category.minSkillLevel]}`);
    }
  }
  return parts.join(' ').trim();
}

export function categoryTags(category: TournamentCategoryDraft): string[] {
  const genderTag = isTeamDispute(category.dispute) && category.genderFree
    ? 'Livre'
    : (genderCompositionShort(category) ?? GENDER_SHORT[category.gender]);
  const tags = [genderTag, DISPUTE_LABEL[category.dispute]];
  if (category.ageBand !== 'open') tags.push(AGE_BAND_LABEL[category.ageBand]);
  if (category.minSkillLevel != null && category.minSkillLevel === category.skillLevel) {
    // Faixa de um único degrau (preset "Elite": min = max) — rótulo simples, sem "mín.".
    tags.push(SKILL_LEVEL_LABEL[category.skillLevel]);
  } else {
    if (category.skillLevel !== 'open') tags.push(SKILL_LEVEL_LABEL[category.skillLevel]);
    // Piso rank 0 (iniciante1) é o preset "Livre" — piso padrão, sem ruído na tag.
    if (category.minSkillLevel && category.minSkillLevel !== 'iniciante1') {
      tags.push(`mín. ${SKILL_LEVEL_LABEL[category.minSkillLevel]}`);
    }
  }
  return tags;
}

export function totalSpots(draft: TournamentCreateDraft): number {
  return draft.categories.reduce((sum, c) => sum + c.spots, 0);
}

export function totalPrizeCents(draft: TournamentCreateDraft): number {
  return draft.categories.reduce((sum, c) => sum + c.prizes.reduce((p, x) => p + x.valueCents, 0), 0);
}

/** 50% / 31,25% / resto — mesma distribuição default do app. */
export function defaultCategoryPrizes(totalCents: number): CategoryPrizeDraft[] {
  if (totalCents <= 0) return [];
  const first = Math.round(totalCents * 0.5);
  const second = Math.round(totalCents * 0.3125);
  const third = totalCents - first - second;
  return [
    { position: '1', valueCents: first, label: 'Campeão' },
    { position: '2', valueCents: second, label: 'Vice-campeão' },
    { position: '3', valueCents: third, label: 'Terceiro lugar' },
  ];
}

// ── Validação por passo (espelha `canContinueFromStep`) ───────────────────────

export function organizerPixComplete(draft: TournamentCreateDraft): boolean {
  if (draft.paymentMode !== 'directWithOrganizer') return true;
  return draft.organizerPixKey.trim().length > 0 && draft.organizerPixRecipientName.trim().length > 0;
}

export function registrationWindowError(draft: TournamentCreateDraft): string | null {
  const opens = draft.registrationOpensAt;
  const closes = draft.registrationClosesAt;
  if (!opens || !closes) return null;
  if (closes < opens) return 'O fechamento das inscrições não pode ser antes da abertura.';
  if (draft.startAt && closes > draft.startAt) return 'As inscrições não podem fechar depois do início do torneio.';
  return null;
}

export type TournamentCreateStep = 'identity' | 'location' | 'categories' | 'registration' | 'rules' | 'review';

export const TOURNAMENT_CREATE_STEPS: readonly TournamentCreateStep[] = ['identity', 'location', 'categories', 'registration', 'rules', 'review'];

export function canContinueFromStep(draft: TournamentCreateDraft, step: TournamentCreateStep): boolean {
  switch (step) {
    case 'identity':
      return draft.name.trim().length > 0;
    case 'location':
      return (
        draft.locationName.trim().length > 0 &&
        draft.city.trim().length > 0 &&
        draft.startAt != null &&
        draft.endAt != null &&
        draft.endAt >= draft.startAt &&
        draft.courtsCount > 0
      );
    case 'categories':
      return draft.categories.length > 0 && draft.categories.every(categoryCompositionValid);
    case 'registration':
      return draft.registrationOpensAt != null && draft.registrationClosesAt != null && registrationWindowError(draft) == null && organizerPixComplete(draft);
    case 'rules':
      return !draft.cashPrizesEnabled || draft.categories.every((c) => c.prizes.length > 0);
    case 'review':
      return isValidForPublish(draft);
  }
}

export function publishBlockReasonForUnsupportedBrackets(draft: TournamentCreateDraft): string {
  for (const category of draft.categories) {
    if (!SUPPORTED_BRACKET_SYSTEMS.includes(category.bracketSystem)) {
      const label = category.name.trim() || 'sem nome';
      return `A categoria "${label}" usa ${BRACKET_SYSTEM_LABEL[category.bracketSystem]}, ainda não suportado.`;
    }
  }
  return '';
}

export function isValidForPublish(draft: TournamentCreateDraft): boolean {
  for (const step of TOURNAMENT_CREATE_STEPS) {
    if (step === 'review') continue;
    if (!canContinueFromStep(draft, step)) return false;
  }
  return publishBlockReasonForUnsupportedBrackets(draft) === '';
}

// ── Quadras (espelha `MatchOpsLogic.defaultCourtsFromCount`) ──────────────────

export interface TournamentCourt {
  id: string;
  name: string;
  order: number;
}

export function defaultCourtsFromCount(count: number): TournamentCourt[] {
  const n = Math.max(count, 1);
  return Array.from({ length: n }, (_, i) => ({ id: `Q${i + 1}`, name: `Quadra ${i + 1}`, order: i + 1 }));
}
