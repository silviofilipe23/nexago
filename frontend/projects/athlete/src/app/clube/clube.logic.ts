/**
 * Clube de Vantagens Nexa no portal do atleta — regras puras (spec
 * `docs/product/vantagens-nexago-spec.md`). Nada aqui toca Firebase: as telas e o store usam estas
 * funções e os specs as travam sem SDK.
 *
 * Os textos que o servidor também produz (consentimento, mensagens do lead) são ESPELHO do
 * `functions/src/benefits-club.ts`: o atleta lê na tela exatamente o que fica gravado no lead.
 */

export const PARTNER_CATEGORIES = ['food', 'sports', 'health', 'services', 'leisure', 'other'] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];
export type PartnerCtaType = 'link' | 'lead_form';
export type PartnerCouponMode = 'none' | 'fixed' | 'athlete';
export type PartnerAudience = 'all' | 'testers';

/**
 * Quem pode usar o benefício (spec v2, item 8). O portal não confere elegibilidade: qualquer
 * requisito diferente de `none` deixa o parceiro bloqueado aqui e o benefício só sai no app.
 */
export type PartnerRequirement =
  | { type: 'none' }
  | { type: 'squad' }
  | { type: 'tournament'; tournamentIds: readonly string[] }
  | { type: 'min_level'; minLevel: string | null };

export const CATEGORY_LABELS: Readonly<Record<PartnerCategory, string>> = {
  food: 'Alimentação',
  sports: 'Artigos esportivos',
  health: 'Saúde e bem-estar',
  services: 'Serviços',
  leisure: 'Lazer',
  other: 'Outros',
};

export interface Partner {
  id: string;
  name: string;
  logoUrl: string | null;
  category: PartnerCategory;
  benefitHighlight: string;
  benefitTitle: string;
  description: string;
  howToUse: readonly string[];
  terms: string;
  ctaType: PartnerCtaType;
  ctaLabel: string;
  link: string | null;
  couponMode: PartnerCouponMode;
  couponCode: string | null;
  brandColor: string;
  cities: readonly string[];
  isMasterSponsor: boolean;
  priority: number;
  active: boolean;
  audience: PartnerAudience;
  leadConsentText: string | null;
  leadSuccessMessage: string | null;
  /** Foto de capa 16:9 (só https). */
  coverUrl: string | null;
  /** Início da janela em ms; `null` = já vale. */
  startsAt: number | null;
  /** Fim da janela em ms; `null` = sem prazo. */
  validUntil: number | null;
  requirement: PartnerRequirement;
  /** Texto do bloqueio, ≤ 80 caracteres. */
  requirementLabel: string | null;
}

export interface BenefitsClubConfig {
  enabled: boolean;
  testerUids: readonly string[];
}

export const EMPTY_CLUB_CONFIG: BenefitsClubConfig = { enabled: false, testerUids: [] };

/** Cor de reserva quando o doc traz uma cor fora do formato `#RRGGBB` (laranja da marca Nexa). */
export const FALLBACK_BRAND_COLOR = '#FF6A1A';

const MAX_HOW_TO_USE_STEPS = 3;
const BRAND_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const REQUIREMENT_LABEL_MAX = 80;
const MAX_REQUIREMENT_TOURNAMENTS = 10;

/** Rótulo do cadeado quando o admin não escreveu `requirementLabel`. */
export const DEFAULT_REQUIREMENT_LABEL = 'Benefício exclusivo';
/** O que a tela do parceiro bloqueado diz no lugar do cupom e do botão. */
export const LOCKED_BENEFIT_NOTICE = 'Disponível no app da NexaGO';

// ── leitura tolerante ─────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strOrNull(value: unknown): string | null {
  return str(value) || null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((item) => item.length > 0) : [];
}

function httpsOrNull(value: unknown): string | null {
  const raw = str(value);
  return /^https:\/\/.+/i.test(raw) ? raw : null;
}

/**
 * Timestamp do Firestore (`toMillis`/`toDate`), `{seconds}` cru, `Date` ou ms → ms. Qualquer outra
 * coisa (ou data inválida) = `null`, que é "sem limite" na janela.
 */
export function toMillisOrNull(value: unknown): number | null {
  if (value == null) return null;
  let ms: unknown = null;
  if (typeof value === 'number') ms = value;
  else if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'object') {
    const v = value as { toMillis?: unknown; toDate?: unknown; seconds?: unknown; nanoseconds?: unknown };
    try {
      if (typeof v.toMillis === 'function') ms = (v.toMillis as () => unknown)();
      else if (typeof v.toDate === 'function') {
        const date = (v.toDate as () => unknown)();
        ms = date instanceof Date ? date.getTime() : null;
      } else if (typeof v.seconds === 'number') {
        const nanos = typeof v.nanoseconds === 'number' ? v.nanoseconds : 0;
        ms = v.seconds * 1000 + Math.floor(nanos / 1e6);
      }
    } catch {
      ms = null;
    }
  }
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

/**
 * `requirement` do doc. Ausente, sem objeto ou com tipo desconhecido = `none`. Tipo conhecido com
 * detalhe estranho continua bloqueado (falha fechada: o cupom de quem tem requisito nunca é público).
 */
export function requirementFromDoc(value: unknown): PartnerRequirement {
  if (value == null || typeof value !== 'object') return { type: 'none' };
  const r = value as Record<string, unknown>;
  switch (r['type']) {
    case 'squad':
      return { type: 'squad' };
    case 'tournament':
      return {
        type: 'tournament',
        tournamentIds: strList(r['tournamentIds']).filter((id) => ID_PATTERN.test(id)).slice(0, MAX_REQUIREMENT_TOURNAMENTS),
      };
    case 'min_level':
      return { type: 'min_level', minLevel: strOrNull(r['minLevel']) };
    default:
      return { type: 'none' };
  }
}

function requirementLabelOrNull(value: unknown): string | null {
  return strOrNull(value)?.slice(0, REQUIREMENT_LABEL_MAX).trim() || null;
}

function defaultCtaLabel(ctaType: PartnerCtaType): string {
  return ctaType === 'lead_form' ? 'Quero contratar' : 'Ver oferta';
}

/**
 * Doc de `partners/{id}` → `Partner`. Tolerante: campo ausente ou fora do formato vira o padrão
 * em vez de derrubar a vitrine inteira. Sem nome não há o que mostrar, então devolve `null`.
 */
export function partnerFromDoc(id: string, data: unknown): Partner | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const name = str(d['name']);
  if (!name || !ID_PATTERN.test(id)) return null;
  const ctaType = pick<PartnerCtaType>(d['ctaType'], ['link', 'lead_form'], 'link');
  const brandColor = str(d['brandColor']);
  const priority = d['priority'];
  return {
    id,
    name,
    logoUrl: httpsOrNull(d['logoUrl']),
    category: pick(d['category'], PARTNER_CATEGORIES, 'other'),
    benefitHighlight: str(d['benefitHighlight']),
    benefitTitle: str(d['benefitTitle']) || str(d['benefitHighlight']),
    description: str(d['description']),
    howToUse: strList(d['howToUse']).slice(0, MAX_HOW_TO_USE_STEPS),
    terms: str(d['terms']),
    ctaType,
    ctaLabel: str(d['ctaLabel']) || defaultCtaLabel(ctaType),
    link: httpsOrNull(d['link']),
    couponMode: pick<PartnerCouponMode>(d['couponMode'], ['none', 'fixed', 'athlete'], 'none'),
    couponCode: strOrNull(d['couponCode']),
    brandColor: BRAND_COLOR_PATTERN.test(brandColor) ? brandColor : FALLBACK_BRAND_COLOR,
    cities: strList(d['cities']),
    isMasterSponsor: d['isMasterSponsor'] === true,
    priority: typeof priority === 'number' && Number.isFinite(priority) ? priority : 0,
    active: d['active'] === true,
    audience: d['audience'] === 'testers' ? 'testers' : 'all',
    leadConsentText: strOrNull(d['leadConsentText']),
    leadSuccessMessage: strOrNull(d['leadSuccessMessage']),
    coverUrl: httpsOrNull(d['coverUrl']),
    startsAt: toMillisOrNull(d['startsAt']),
    validUntil: toMillisOrNull(d['validUntil']),
    requirement: requirementFromDoc(d['requirement']),
    requirementLabel: requirementLabelOrNull(d['requirementLabel']),
  };
}

/** Parceiro com requisito: aparece com cadeado e sem cupom/botão no portal. */
export function isLocked(partner: Pick<Partner, 'requirement'>): boolean {
  return partner.requirement.type !== 'none';
}

/** Texto do cadeado: o do admin ou o padrão. */
export function lockLabel(partner: Pick<Partner, 'requirementLabel'>): string {
  return partner.requirementLabel || DEFAULT_REQUIREMENT_LABEL;
}

/** Dentro da janela `[startsAt, validUntil]`? Sem data = sem limite daquele lado. */
export function withinWindow(partner: Pick<Partner, 'startsAt' | 'validUntil'>, now: number): boolean {
  if (partner.startsAt !== null && now < partner.startsAt) return false;
  if (partner.validUntil !== null && now > partner.validUntil) return false;
  return true;
}

/** Doc de `appConfig/benefitsClub` → config. Ausente ou estranho = clube desligado, ninguém testa. */
export function clubConfigFromDoc(data: unknown): BenefitsClubConfig {
  if (data == null || typeof data !== 'object') return EMPTY_CLUB_CONFIG;
  const d = data as Record<string, unknown>;
  return { enabled: d['enabled'] === true, testerUids: strList(d['testerUids']) };
}

// ── quem vê o quê ─────────────────────────────────────────────────────────────

/** Papel `admin` ou `superAdmin` nas claims do token — mesma regra do `callerFromAuth` do servidor. */
export function isAdminClaims(claims: Readonly<Record<string, unknown>> | null | undefined): boolean {
  if (!claims) return false;
  const roles = claims['roles'];
  return (Array.isArray(roles) && roles.includes('admin')) || claims['superAdmin'] === true;
}

/** Quem testa: admin ou uid em `testerUids`. */
export function isTester(uid: string | null | undefined, isAdmin: boolean, config: BenefitsClubConfig): boolean {
  if (isAdmin) return true;
  return !!uid && config.testerUids.includes(uid);
}

/** O clube aparece (card do Competir, item do menu)? Flag ligada para todos, ou quem testa. */
export function clubVisible(config: BenefitsClubConfig, tester: boolean): boolean {
  return config.enabled || tester;
}

/** "Goiânia", "goiania " e "GOIÂNIA" são a mesma cidade. */
export function normalizeCity(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function servesCity(partner: Partner, athleteCity: string | null | undefined): boolean {
  if (partner.cities.length === 0) return true;
  const city = normalizeCity(athleteCity);
  return city.length > 0 && partner.cities.some((c) => normalizeCity(c) === city);
}

function byPriorityThenName(a: Partner, b: Partner): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
}

/**
 * A vitrine desta pessoa: ativo, dentro da janela de validade em `now` (ms), público (ou de teste
 * para quem testa) e da cidade dela (sem cidades = todas). Maior prioridade primeiro; empate pelo
 * nome. Parceiro com requisito continua na vitrine (bloqueado).
 */
export function visiblePartners(
  partners: readonly Partner[],
  tester: boolean,
  athleteCity: string | null | undefined,
  now: number = Date.now(),
): Partner[] {
  return partners
    .filter(
      (p) => p.active && withinWindow(p, now) && (p.audience === 'all' || tester) && servesCity(p, athleteCity),
    )
    .sort(byPriorityThenName);
}

/** O patrocinador oficial do banner: o primeiro marcado, na ordem da vitrine. */
export function masterSponsor(partners: readonly Partner[]): Partner | null {
  return partners.find((p) => p.isMasterSponsor) ?? null;
}

/** As categorias que têm parceiro, na ordem fixa dos chips. */
export function categoriesOf(partners: readonly Partner[]): PartnerCategory[] {
  const present = new Set(partners.map((p) => p.category));
  return PARTNER_CATEGORIES.filter((c) => present.has(c));
}

export function partnersInCategory(partners: readonly Partner[], category: PartnerCategory | null): Partner[] {
  return category ? partners.filter((p) => p.category === category) : [...partners];
}

// ── código, cupom e link ──────────────────────────────────────────────────────

/** `NEXA-` + os 4 primeiros alfanuméricos do uid em maiúsculas. É o `ref` do link, nunca o uid. */
export function athleteCode(uid: string): string {
  return `NEXA-${uid.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}`;
}

/** O cupom que a tela mostra: fixo do parceiro, o código do atleta, ou nenhum (sempre nenhum se bloqueado). */
export function couponFor(
  partner: Pick<Partner, 'couponMode' | 'couponCode'> & Partial<Pick<Partner, 'requirement'>>,
  uid: string,
): string | null {
  if (partner.requirement && partner.requirement.type !== 'none') return null;
  switch (partner.couponMode) {
    case 'fixed':
      return partner.couponCode;
    case 'athlete':
      return uid ? athleteCode(uid) : null;
    default:
      return null;
  }
}

export const PARTNER_LINK_UTM = {
  utm_source: 'nexago',
  utm_medium: 'web',
  utm_campaign: 'clube_vantagens',
} as const;

/** Link do parceiro com a marcação da NexaGO, preservando a query que ele já tem. Só https. */
export function trackedPartnerUrl(link: string | null | undefined, code: string): string | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  for (const [key, value] of Object.entries(PARTNER_LINK_UTM)) url.searchParams.set(key, value);
  url.searchParams.set('ref', code);
  return url.toString();
}

/** "Como usar": os passos do parceiro, ou o padrão do tipo de botão. */
export function howToUseSteps(partner: Partner, coupon: string | null): string[] {
  if (partner.howToUse.length > 0) return partner.howToUse.slice(0, MAX_HOW_TO_USE_STEPS);
  if (partner.ctaType === 'lead_form') {
    return [
      `Clique em ${partner.ctaLabel}.`,
      `Confira seus dados e autorize o envio para a ${partner.name}.`,
      `A ${partner.name} chama você no WhatsApp.`,
    ];
  }
  return [
    `Clique em ${partner.ctaLabel}. A página da ${partner.name} abre já com o link da NexaGO.`,
    'Escolha o que quiser normalmente.',
    coupon ? `No fechamento, use o cupom ${coupon}.` : 'O benefício vale para quem chega pelo link da NexaGO.',
  ];
}

export interface TextSegment {
  text: string;
  strong: boolean;
}

/** Quebra o passo para destacar o nome do botão e o cupom, como no desenho. */
export function emphasize(text: string, terms: readonly (string | null | undefined)[]): TextSegment[] {
  const wanted = terms.filter((t): t is string => !!t && t.trim().length > 0);
  const segments: TextSegment[] = [];
  let rest = text;
  while (rest.length > 0) {
    let at = -1;
    let hit = '';
    for (const term of wanted) {
      const i = rest.indexOf(term);
      if (i >= 0 && (at < 0 || i < at || (i === at && term.length > hit.length))) {
        at = i;
        hit = term;
      }
    }
    if (at < 0) {
      segments.push({ text: rest, strong: false });
      break;
    }
    if (at > 0) segments.push({ text: rest.slice(0, at), strong: false });
    segments.push({ text: hit, strong: true });
    rest = rest.slice(at + hit.length);
  }
  return segments;
}

// ── origem da visita ──────────────────────────────────────────────────────────

/** Origens que o servidor aceita (`EVENT_SOURCES` sem `unknown`). */
export const CLUB_SOURCES = [
  'hub_card',
  'club_list',
  'sponsor_banner',
  'competir_web',
  'home',
  'deeplink',
  'push',
] as const;
export type ClubSource = (typeof CLUB_SOURCES)[number];

/** `?origem=` da URL; ausente ou desconhecida = `deeplink` (link solto, digitado, colado). */
export function parseClubSource(raw: unknown): ClubSource {
  return pick(raw, CLUB_SOURCES, 'deeplink');
}

// ── formulário do lead (espelho do `parseLead` do servidor) ───────────────────

export const LEAD_NAME_MAX = 120;
export const LEAD_NEIGHBORHOOD_MAX = 80;

export interface LeadFormInput {
  partnerId: string;
  name: string;
  whatsapp: string;
  neighborhood: string;
  cep: string;
  consent: boolean;
}

export interface ValidLead {
  partnerId: string;
  name: string;
  /** Com DDI: `55` + DDD + número. */
  whatsapp: string;
  neighborhood: string;
  /** 8 dígitos. */
  cep: string;
}

export type LeadValidation = { ok: true; lead: ValidLead } | { ok: false; error: string };

export function digitsOf(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
}

/** Mesma regra do servidor: 10 ou 11 dígitos, com ou sem o 55 na frente. */
export function normalizeWhatsapp(value: string | null | undefined): string | null {
  let digits = digitsOf(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return `55${digits}`;
}

export function normalizeCep(value: string | null | undefined): string | null {
  const digits = digitsOf(value);
  return digits.length === 8 ? digits : null;
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Valida como o `parseLead` do servidor, com as MESMAS mensagens e na mesma ordem. */
export function validateLead(input: LeadFormInput): LeadValidation {
  if (!ID_PATTERN.test(input.partnerId)) return { ok: false, error: 'Parceiro inválido.' };
  if (input.consent !== true) {
    return { ok: false, error: 'Marque a autorização para enviarmos seus dados ao parceiro.' };
  }
  const name = collapse(input.name);
  if (name.length < 2 || name.length > LEAD_NAME_MAX) return { ok: false, error: 'Informe seu nome.' };
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) return { ok: false, error: 'Informe um WhatsApp com DDD.' };
  const neighborhood = collapse(input.neighborhood);
  if (neighborhood.length < 2 || neighborhood.length > LEAD_NEIGHBORHOOD_MAX) {
    return { ok: false, error: 'Informe seu bairro.' };
  }
  const cep = normalizeCep(input.cep);
  if (!cep) return { ok: false, error: 'Informe um CEP com 8 números.' };
  return { ok: true, lead: { partnerId: input.partnerId, name, whatsapp, neighborhood, cep } };
}

/** Máscara do CEP enquanto digita: `74230010` → `74230-010`. */
export function maskCep(value: string): string {
  const digits = digitsOf(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Telefone do perfil para o campo: `+5562982406456` → `(62) 98240-6456`. Fora do formato, cru. */
export function formatWhatsapp(value: string | null | undefined): string {
  const normalized = normalizeWhatsapp(value);
  if (!normalized) return (value ?? '').trim();
  const local = normalized.slice(2);
  const ddd = local.slice(0, 2);
  const number = local.slice(2);
  const split = number.length - 4;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}

/** Texto padrão do consentimento. IDÊNTICO ao `defaultConsentText` do servidor. */
export function defaultConsentText(partnerName: string): string {
  return `Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP com a ${partnerName} ` +
    'para que ela entre em contato comigo sobre esta oferta.';
}

/** O texto que o atleta aceita: o do parceiro ou o padrão (o servidor grava o mesmo). */
export function consentTextFor(partner: Pick<Partner, 'name' | 'leadConsentText'>): string {
  return partner.leadConsentText || defaultConsentText(partner.name || 'parceiro');
}

export function defaultLeadSuccessMessage(partnerName: string): string {
  return `Pronto! A ${partnerName} vai falar com você pelo WhatsApp`;
}

// ── aparência ─────────────────────────────────────────────────────────────────

export type BrandTextTone = 'light' | 'dark';

function channel(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** Luminâncias do `--nx-text` (#F4F4F5) e do `--nx-text-on-orange` (#0A0A0A). */
const LIGHT_TEXT_LUMINANCE = luminance('#F4F4F5');
const DARK_TEXT_LUMINANCE = luminance('#0A0A0A');

/** Texto claro ou escuro sobre a cor da marca: o que der mais contraste (WCAG). */
export function brandTextTone(brandColor: string): BrandTextTone {
  const color = BRAND_COLOR_PATTERN.test(brandColor) ? brandColor : FALLBACK_BRAND_COLOR;
  const bg = luminance(color);
  const withLight = (LIGHT_TEXT_LUMINANCE + 0.05) / (bg + 0.05);
  const withDark = (bg + 0.05) / (DARK_TEXT_LUMINANCE + 0.05);
  return withLight >= withDark ? 'light' : 'dark';
}

/** Iniciais para quando o parceiro não tem logo: "Fast Açaí" → "FA", "Decathlon" → "DE". */
export function partnerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

/** Linha de categoria do card: "Serviços · Oficial" para o patrocinador. */
export function categoryLine(partner: Pick<Partner, 'category' | 'isMasterSponsor'>): string {
  const label = CATEGORY_LABELS[partner.category];
  return partner.isMasterSponsor ? `${label} · Oficial` : label;
}

/** Linha do hero do parceiro: "Patrocinador oficial · Serviços" ou "Alimentação · Goiânia". */
export function heroLine(partner: Pick<Partner, 'category' | 'isMasterSponsor' | 'cities'>): string {
  const label = CATEGORY_LABELS[partner.category];
  if (partner.isMasterSponsor) return `Patrocinador oficial · ${label}`;
  return partner.cities.length > 0 ? `${label} · ${partner.cities.join(', ')}` : label;
}

/** Texto miúdo sob o botão do parceiro. */
export function ctaHint(partner: Pick<Partner, 'name' | 'ctaType'>): string {
  return partner.ctaType === 'lead_form'
    ? `Seus dados só vão para a ${partner.name} com a sua autorização`
    : `Abre o site da ${partner.name} numa nova aba`;
}

// ── erros ─────────────────────────────────────────────────────────────────────

/** Mensagem que o `HttpsError` traz, quando é uma frase de verdade (e não "NOT FOUND", "internal"). */
function serverSentence(message: string): string | null {
  const detail = message
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '')
    .trim();
  if (detail.length < 6 || !/\s/.test(detail)) return null;
  if (detail === detail.toUpperCase()) return null;
  return detail;
}

const SENTENCE_CODES = new Set([
  'invalid-argument',
  'failed-precondition',
  'not-found',
  'permission-denied',
  'already-exists',
  'internal',
]);

/**
 * Erro da callable para a tela. O servidor manda frases prontas em português; o SDK, códigos crus
 * ("NOT FOUND" quando a função não foi publicada, "internal" em falha de rede). Sessão morta tem
 * mensagem própria: tentar de novo não resolve.
 */
export function clubErrorMessage(error: unknown, fallback: string): string {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code.replace(/^functions\//, '') : '';
  if (code === 'unauthenticated') return 'Sua sessão expirou. Entre de novo para continuar.';
  if (!SENTENCE_CODES.has(code)) return fallback;
  const message = typeof err?.message === 'string' ? serverSentence(err.message) : null;
  return message ?? fallback;
}

export function isUnauthenticated(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.replace(/^functions\//, '') === 'unauthenticated';
}
