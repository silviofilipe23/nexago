/** Configurações do organizador — os três cards de `/painel/config` (Perfil, Pagamentos e
 *  Regras padrão de evento), guardados como três mapas em `users/{uid}`.
 *
 *  Por que em `users/{uid}` e não numa coleção nova: a rule de update de `users` é uma DENYLIST
 *  (bloqueia `roles`, `reputation`, `sandRank`, `phoneVerified`…), então campo novo do próprio
 *  dono passa sem tocar em `firestore.rules` — nada aqui depende de deploy. `displayName` e
 *  `phone` já moram nesse doc, então o perfil não fica partido em dois lugares.
 *
 *  ATENÇÃO: `users/{uid}` é legível por qualquer autenticado quando a conta também tem a role
 *  `athlete` (`userDocIsPublicAthlete` em firestore.rules). Nada aqui é segredo — o Pix de
 *  recebimento vai parar no doc público do torneio de qualquer forma —, mas não adicione
 *  campo sensível a estes mapas sem antes mover tudo para uma coleção própria. */

import {
  emptyCategoryDraft,
  emptyTournamentDraft,
  type TournamentBestOf,
  type TournamentBracketSystem,
  type TournamentCategoryDraft,
  type TournamentCreateDraft,
  type TournamentPaymentMode,
  type TournamentSport,
  type TournamentVisibility,
} from './tournament-create.model';
import { pixKeyTypeFromStored, type PixKeyType } from './pix-key';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** O responsável NÃO fica aqui: é o `displayName` do doc (mesmo campo do Firebase Auth). */
export interface OrganizerProfile {
  orgName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  state: string;
  logoUrl: string | null;
}

/** Pix de RECEBIMENTO DIRETO (modo `directWithOrganizer`) — não confundir com a chave de SAQUE,
 *  que vive em `organizerWallets/{uid}.payoutPixKey` e é gerenciada pela tela Financeiro.
 *  Os quatro campos mapeiam 1:1 em `tournaments/{id}.organizerPix`. */
export interface OrganizerPaymentSettings {
  pixKey: string;
  /** `''` = ainda não escolhido. */
  pixKeyType: PixKeyType | '';
  recipientName: string;
  city: string;
}

export interface OrganizerEventDefaults {
  // nível torneio
  sport: TournamentSport;
  courtsCount: number;
  defaultPriceCents: number;
  paymentMode: TournamentPaymentMode;
  visibility: TournamentVisibility;
  waitlistEnabled: boolean;
  uniformRequired: boolean;
  rankingEnabled: boolean;
  regulationNotes: string;
  // nível categoria
  bracketSystem: TournamentBracketSystem;
  bestOf: TournamentBestOf;
  finalBestOf5: boolean;
  spots: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  maxRegistrationsPerAthlete: number;
}

export interface OrganizerSettings {
  profile: OrganizerProfile;
  payments: OrganizerPaymentSettings;
  defaults: OrganizerEventDefaults;
}

// ── Valores padrão ────────────────────────────────────────────────────────────

const BASE_DRAFT = emptyTournamentDraft();
const BASE_CATEGORY = emptyCategoryDraft('');

export const DEFAULT_ORGANIZER_PROFILE: OrganizerProfile = {
  orgName: '',
  contactEmail: '',
  contactPhone: '',
  city: '',
  state: '',
  logoUrl: null,
};

export const DEFAULT_ORGANIZER_PAYMENTS: OrganizerPaymentSettings = {
  pixKey: '',
  pixKeyType: '',
  recipientName: '',
  city: '',
};

/** Derivado de `emptyTournamentDraft()`/`emptyCategoryDraft()` de propósito: o fallback de quem
 *  nunca configurou nada É exatamente o que o wizard já faz hoje. Mudar o default do wizard muda
 *  este aqui junto, sem os dois saírem de sincronia. */
export const DEFAULT_ORGANIZER_EVENT_DEFAULTS: OrganizerEventDefaults = {
  sport: BASE_DRAFT.sport,
  courtsCount: BASE_DRAFT.courtsCount,
  defaultPriceCents: BASE_DRAFT.defaultPriceCents,
  paymentMode: BASE_DRAFT.paymentMode,
  visibility: BASE_DRAFT.visibility,
  waitlistEnabled: BASE_DRAFT.waitlistEnabled,
  uniformRequired: BASE_DRAFT.uniformRequired,
  rankingEnabled: BASE_DRAFT.rankingEnabled,
  regulationNotes: BASE_DRAFT.regulationNotes,
  bracketSystem: BASE_CATEGORY.bracketSystem,
  bestOf: BASE_CATEGORY.bestOf,
  finalBestOf5: BASE_CATEGORY.finalBestOf5,
  spots: BASE_CATEGORY.spots,
  teamsPerGroup: BASE_CATEGORY.teamsPerGroup,
  qualifiersPerGroup: BASE_CATEGORY.qualifiersPerGroup,
  maxRegistrationsPerAthlete: BASE_CATEGORY.maxRegistrationsPerAthlete,
};

export const DEFAULT_ORGANIZER_SETTINGS: OrganizerSettings = {
  profile: DEFAULT_ORGANIZER_PROFILE,
  payments: DEFAULT_ORGANIZER_PAYMENTS,
  defaults: DEFAULT_ORGANIZER_EVENT_DEFAULTS,
};

// ── Faixas numéricas ──────────────────────────────────────────────────────────

/** Espelho EXATO dos limites que o wizard já aplica (`bumpCourts`, `bumpCatSpots`, `bumpCat` em
 *  criar-torneio.component.ts) — a tela de configuração não pode ser mais rígida nem mais frouxa
 *  que a tela que ela alimenta. */
export const ORGANIZER_DEFAULTS_RANGE = {
  courtsCount: { min: 1, max: 20, step: 1 },
  spots: { min: 2, max: 64, step: 2 },
  teamsPerGroup: { min: 2, max: 8, step: 1 },
  qualifiersPerGroup: { min: 1, max: 4, step: 1 },
  maxRegistrationsPerAthlete: { min: 1, max: 5, step: 1 },
} as const;

export type OrganizerDefaultsCounter = keyof typeof ORGANIZER_DEFAULTS_RANGE;

export function clampOrganizerDefault(field: OrganizerDefaultsCounter, value: number): number {
  const { min, max } = ORGANIZER_DEFAULTS_RANGE[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

// ── Leitura do doc ────────────────────────────────────────────────────────────

function mapOf(v: unknown): Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function int(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
}

/** Só aceita valor que ainda existe no enum — categoria/formato removidos do produto não
 *  ressuscitam via doc antigo. */
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const SPORTS: readonly TournamentSport[] = ['beachVolleyball', 'indoorVolleyball', 'footvolley'];
const BRACKET_SYSTEMS: readonly TournamentBracketSystem[] = [
  'groupsThenKnockout',
  'singleElimination',
  'roundRobin',
  'groupsWithRepechage',
  'doubleElimination',
];
const BEST_OFS: readonly TournamentBestOf[] = ['singleSet', 'bestOf3', 'bestOf5'];
const PAYMENT_MODES: readonly TournamentPaymentMode[] = ['appPixCard', 'directWithOrganizer'];
const VISIBILITIES: readonly TournamentVisibility[] = ['publicListing', 'linkOnly'];

function parseProfile(raw: Record<string, unknown>): OrganizerProfile {
  const logoUrl = raw['logoUrl'];
  return {
    orgName: str(raw['orgName'], ''),
    contactEmail: str(raw['contactEmail'], ''),
    contactPhone: str(raw['contactPhone'], ''),
    city: str(raw['city'], ''),
    state: str(raw['state'], '').toUpperCase(),
    logoUrl: typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null,
  };
}

function parsePayments(raw: Record<string, unknown>): OrganizerPaymentSettings {
  return {
    pixKey: str(raw['pixKey'], ''),
    pixKeyType: pixKeyTypeFromStored(str(raw['pixKeyType'], '')) ?? '',
    recipientName: str(raw['recipientName'], ''),
    city: str(raw['city'], ''),
  };
}

function parseDefaults(raw: Record<string, unknown>): OrganizerEventDefaults {
  const d = DEFAULT_ORGANIZER_EVENT_DEFAULTS;
  return {
    sport: oneOf(raw['sport'], SPORTS, d.sport),
    courtsCount: clampOrganizerDefault('courtsCount', int(raw['courtsCount'], d.courtsCount)),
    defaultPriceCents: Math.max(0, int(raw['defaultPriceCents'], d.defaultPriceCents)),
    paymentMode: oneOf(raw['paymentMode'], PAYMENT_MODES, d.paymentMode),
    visibility: oneOf(raw['visibility'], VISIBILITIES, d.visibility),
    waitlistEnabled: bool(raw['waitlistEnabled'], d.waitlistEnabled),
    uniformRequired: bool(raw['uniformRequired'], d.uniformRequired),
    rankingEnabled: bool(raw['rankingEnabled'], d.rankingEnabled),
    regulationNotes: typeof raw['regulationNotes'] === 'string' ? (raw['regulationNotes'] as string) : d.regulationNotes,
    bracketSystem: oneOf(raw['bracketSystem'], BRACKET_SYSTEMS, d.bracketSystem),
    bestOf: oneOf(raw['bestOf'], BEST_OFS, d.bestOf),
    finalBestOf5: bool(raw['finalBestOf5'], d.finalBestOf5),
    spots: clampOrganizerDefault('spots', int(raw['spots'], d.spots)),
    teamsPerGroup: clampOrganizerDefault('teamsPerGroup', int(raw['teamsPerGroup'], d.teamsPerGroup)),
    qualifiersPerGroup: clampOrganizerDefault('qualifiersPerGroup', int(raw['qualifiersPerGroup'], d.qualifiersPerGroup)),
    maxRegistrationsPerAthlete: clampOrganizerDefault(
      'maxRegistrationsPerAthlete',
      int(raw['maxRegistrationsPerAthlete'], d.maxRegistrationsPerAthlete),
    ),
  };
}

/** Doc inteiro de `users/{uid}` → settings. Campo ausente vira default; nunca lança. */
export function parseOrganizerSettings(userDoc: Record<string, unknown> | undefined): OrganizerSettings {
  const doc = mapOf(userDoc);
  return {
    profile: parseProfile(mapOf(doc['organizerProfile'])),
    payments: parsePayments(mapOf(doc['organizerPayments'])),
    defaults: parseDefaults(mapOf(doc['organizerDefaults'])),
  };
}

// ── Aplicação dos defaults no wizard ──────────────────────────────────────────

/** Preenche o rascunho NOVO de torneio com os padrões do organizador. Só toca nos campos que são
 *  configuráveis — nome, datas, local, arena e categorias ficam intactos.
 *
 *  Chamar SOMENTE na criação. Aplicar num torneio carregado pra edição sobrescreveria dados
 *  reais; quem chama tem que garantir `tournamentId == null`. */
export function applyOrganizerDefaults(
  draft: TournamentCreateDraft,
  defaults: OrganizerEventDefaults,
): TournamentCreateDraft {
  return {
    ...draft,
    sport: defaults.sport,
    courtsCount: defaults.courtsCount,
    defaultPriceCents: defaults.defaultPriceCents,
    paymentMode: defaults.paymentMode,
    visibility: defaults.visibility,
    waitlistEnabled: defaults.waitlistEnabled,
    uniformRequired: defaults.uniformRequired,
    rankingEnabled: defaults.rankingEnabled,
    regulationNotes: defaults.regulationNotes,
  };
}

/** Preenche os dados de recebimento direto no rascunho novo. Separado de
 *  `applyOrganizerDefaults` porque vem de outro card (Pagamentos) e pode estar vazio: sem chave
 *  cadastrada, o rascunho continua como está e o wizard segue pedindo na hora. */
export function applyOrganizerPaymentDefaults(
  draft: TournamentCreateDraft,
  payments: OrganizerPaymentSettings,
): TournamentCreateDraft {
  if (!payments.pixKey.trim()) return draft;
  return {
    ...draft,
    organizerPixKey: payments.pixKey,
    organizerPixKeyType: payments.pixKeyType,
    organizerPixRecipientName: payments.recipientName,
    organizerPixCity: payments.city,
  };
}

/** Preenche a categoria NOVA. `id`, `name` e o resto da identidade da categoria ficam intactos. */
export function applyOrganizerCategoryDefaults(
  category: TournamentCategoryDraft,
  defaults: OrganizerEventDefaults,
): TournamentCategoryDraft {
  return {
    ...category,
    bracketSystem: defaults.bracketSystem,
    bestOf: defaults.bestOf,
    finalBestOf5: defaults.finalBestOf5,
    spots: defaults.spots,
    teamsPerGroup: defaults.teamsPerGroup,
    qualifiersPerGroup: defaults.qualifiersPerGroup,
    maxRegistrationsPerAthlete: defaults.maxRegistrationsPerAthlete,
  };
}
