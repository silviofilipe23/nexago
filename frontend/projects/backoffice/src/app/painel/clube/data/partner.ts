/**
 * Clube de Vantagens Nexa: a vitrine `partners/{partnerId}` (spec `docs/product/vantagens-nexago-spec.md`).
 * Funções puras: o repositório lê e grava, as telas montam formulário, prévia e tabela a partir daqui.
 *
 * A escrita é direto do cliente e a rule `partnerValid` (firestore.rules) confere cada campo, então a
 * validação daqui espelha a rule: o que passa aqui passa lá, com a mensagem em português antes.
 */

import {
  COUPON_URL_PARAM_PATTERN,
  LOCATIONS_MAX,
  PLACEMENTS,
  REQUIREMENT_LABEL_MAX,
  TERMS_TAGS,
  dateInputValue,
  endOfLocalDay,
  locationErrors,
  locationForm,
  locationsFromDoc,
  locationsPayload,
  requirementError,
  requirementFromDoc,
  requirementPayload,
  startOfLocalDay,
  subsetOf,
  validityError,
  type LocationForm,
  type PartnerLocation,
  type PartnerPlacement,
  type PartnerRequirement,
  type PartnerTermsTag,
  type RequirementType,
} from './partner-premium';

export const PARTNER_CATEGORIES = ['food', 'sports', 'health', 'services', 'leisure', 'other'] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<PartnerCategory, string> = {
  food: 'Alimentação',
  sports: 'Esporte',
  health: 'Saúde',
  services: 'Serviços',
  leisure: 'Lazer',
  other: 'Outros',
};

export const CTA_TYPES = ['link', 'lead_form'] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const CTA_TYPE_LABELS: Record<CtaType, string> = { link: 'Abrir link', lead_form: 'Formulário de lead' };

export const COUPON_MODES = ['none', 'fixed', 'athlete'] as const;
export type CouponMode = (typeof COUPON_MODES)[number];

export const COUPON_MODE_LABELS: Record<CouponMode, string> = { none: 'Sem', fixed: 'Fixo', athlete: 'Por atleta' };

export const AUDIENCES = ['all', 'testers'] as const;
export type PartnerAudience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<PartnerAudience, string> = { all: 'Todos', testers: 'Só quem testa' };

// Limites da rule `partnerValid`.
export const NAME_MAX = 80;
export const HIGHLIGHT_MAX = 24;
export const BENEFIT_TITLE_MAX = 80;
export const DESCRIPTION_MAX = 600;
export const HOW_TO_USE_MAX = 3;
export const TERMS_MAX = 2000;
export const CTA_LABEL_MAX = 32;
export const URL_MAX = 2000;
export const COUPON_CODE_MAX = 24;
export const CITIES_MAX = 50;
export const CONSENT_TEXT_MAX = 600;
export const SUCCESS_MESSAGE_MAX = 160;
export const ACTOR_NAME_MAX = 120;

export const PARTNER_ID_MAX = 60;
export const PARTNER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
/** O id `novo` é a rota de criação: nunca vira id de parceiro. */
export const NEW_PARTNER_ROUTE_ID = 'novo';

const HTTPS_PATTERN = /^https:\/\/.+/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const DEFAULT_BRAND_COLOR = '#FF6A1A';

/** Espelho de `defaultConsentText` em `functions/src/benefits-club.ts`. */
export function defaultConsentText(partnerName: string): string {
  return (
    `Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP com a ${partnerName} ` +
    'para que ela entre em contato comigo sobre esta oferta.'
  );
}

/** Espelho de `defaultLeadSuccessMessage` em `functions/src/benefits-club.ts`. */
export function defaultLeadSuccessMessage(partnerName: string): string {
  return `Pronto! A ${partnerName} vai falar com você pelo WhatsApp`;
}

export interface Partner {
  id: string;
  name: string;
  logoUrl: string | null;
  category: PartnerCategory;
  benefitHighlight: string;
  benefitTitle: string;
  description: string;
  howToUse: string[];
  terms: string;
  ctaType: CtaType;
  ctaLabel: string;
  link: string | null;
  couponMode: CouponMode;
  couponCode: string | null;
  brandColor: string;
  cities: string[];
  isMasterSponsor: boolean;
  priority: number;
  active: boolean;
  audience: PartnerAudience;
  leadConsentText: string | null;
  leadSuccessMessage: string | null;
  coverUrl: string | null;
  startsAt: Date | null;
  validUntil: Date | null;
  featured: boolean;
  placements: PartnerPlacement[];
  couponUrlParam: string | null;
  termsTags: PartnerTermsTag[];
  locations: PartnerLocation[];
  requirement: PartnerRequirement;
  requirementLabel: string | null;
  createdAt: Date | null;
  createdByName: string;
  updatedAt: Date | null;
  updatedByName: string;
}

/**
 * O que o backoffice grava, sem os campos de autoria (`createdAt`, `createdByName`, `updatedAt`,
 * `updatedBy`, `updatedByName`), que o repositório acrescenta. Somado a eles, é exatamente a
 * allowlist da rule.
 */
export interface PartnerPayload {
  name: string;
  logoUrl: string | null;
  category: PartnerCategory;
  benefitHighlight: string;
  benefitTitle: string;
  description: string;
  howToUse: string[];
  terms: string;
  ctaType: CtaType;
  ctaLabel: string;
  link: string | null;
  couponMode: CouponMode;
  couponCode: string | null;
  brandColor: string;
  cities: string[];
  isMasterSponsor: boolean;
  priority: number;
  active: boolean;
  audience: PartnerAudience;
  leadConsentText: string | null;
  leadSuccessMessage: string | null;
  // v2 (premium)
  coverUrl: string | null;
  startsAt: Date | null;
  validUntil: Date | null;
  featured: boolean;
  placements: PartnerPlacement[];
  couponUrlParam: string | null;
  termsTags: PartnerTermsTag[];
  locations: PartnerLocation[];
  requirement: PartnerRequirement;
  requirementLabel: string | null;
}

/** `partnerPrivate/{partnerId}`: o cupom de parceiro com requisito (só admin lê) e os avisos já enviados. */
export interface PartnerPrivate {
  couponCode: string | null;
  notifiedNewAt: Date | null;
  notifiedEndingAt: Date | null;
}

/** O editor trabalha com texto cru: cidades separadas por vírgula, "como usar" uma por linha. */
export interface PartnerForm {
  name: string;
  category: PartnerCategory;
  logoUrl: string | null;
  brandColor: string;
  cities: string;
  benefitHighlight: string;
  benefitTitle: string;
  description: string;
  howToUse: string;
  terms: string;
  ctaType: CtaType;
  ctaLabel: string;
  link: string;
  couponMode: CouponMode;
  couponCode: string;
  leadConsentText: string;
  leadSuccessMessage: string;
  audience: PartnerAudience;
  priority: string;
  active: boolean;
  isMasterSponsor: boolean;
  // v2 (premium). Datas como "AAAA-MM-DD" (input date, dia local).
  coverUrl: string | null;
  startsAt: string;
  validUntil: string;
  featured: boolean;
  placements: PartnerPlacement[];
  couponUrlParam: string;
  termsTags: PartnerTermsTag[];
  locations: LocationForm[];
  requirementType: RequirementType;
  tournamentIds: string[];
  minLevel: string;
  requirementLabel: string;
}

export type PartnerFormField = keyof PartnerForm;
export type PartnerFormErrors = Partial<Record<PartnerFormField, string>>;

// ── leitura ────────────────────────────────────────────────────────────────

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function textOrNull(value: unknown): string | null {
  const t = text(value).trim();
  return t === '' ? null : t;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

function dateOf(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

function httpsOrNull(value: unknown): string | null {
  const t = textOrNull(value);
  return t && HTTPS_PATTERN.test(t) ? t : null;
}

/** Doc de `partnerPrivate/{id}`; ausente = sem cupom privado e nenhum aviso enviado. */
export function partnerPrivateFromDoc(data: Record<string, unknown> | undefined): PartnerPrivate {
  const d = data ?? {};
  return {
    couponCode: textOrNull(d['couponCode']),
    notifiedNewAt: dateOf(d['notifiedNewAt']),
    notifiedEndingAt: dateOf(d['notifiedEndingAt']),
  };
}

/** Lê o doc sem quebrar com campo faltando ou de tipo errado. */
export function partnerFromDoc(id: string, data: Record<string, unknown>): Partner {
  const color = text(data['brandColor']);
  return {
    id,
    name: text(data['name']).trim() || id,
    logoUrl: textOrNull(data['logoUrl']),
    category: pick(data['category'], PARTNER_CATEGORIES, 'other'),
    benefitHighlight: text(data['benefitHighlight']),
    benefitTitle: text(data['benefitTitle']),
    description: text(data['description']),
    howToUse: stringList(data['howToUse']),
    terms: text(data['terms']),
    ctaType: pick(data['ctaType'], CTA_TYPES, 'link'),
    ctaLabel: text(data['ctaLabel']),
    link: textOrNull(data['link']),
    couponMode: pick(data['couponMode'], COUPON_MODES, 'none'),
    couponCode: textOrNull(data['couponCode']),
    brandColor: COLOR_PATTERN.test(color) ? color : DEFAULT_BRAND_COLOR,
    cities: stringList(data['cities']),
    isMasterSponsor: data['isMasterSponsor'] === true,
    priority: typeof data['priority'] === 'number' && Number.isFinite(data['priority']) ? data['priority'] : 0,
    active: data['active'] === true,
    audience: pick(data['audience'], AUDIENCES, 'all'),
    leadConsentText: textOrNull(data['leadConsentText']),
    leadSuccessMessage: textOrNull(data['leadSuccessMessage']),
    coverUrl: httpsOrNull(data['coverUrl']),
    startsAt: dateOf(data['startsAt']),
    validUntil: dateOf(data['validUntil']),
    featured: data['featured'] === true,
    placements: subsetOf(data['placements'], PLACEMENTS),
    couponUrlParam: COUPON_URL_PARAM_PATTERN.test(text(data['couponUrlParam'])) ? text(data['couponUrlParam']) : null,
    termsTags: subsetOf(data['termsTags'], TERMS_TAGS),
    locations: locationsFromDoc(data['locations']),
    requirement: requirementFromDoc(data['requirement']),
    requirementLabel: textOrNull(data['requirementLabel']),
    createdAt: dateOf(data['createdAt']),
    createdByName: text(data['createdByName']),
    updatedAt: dateOf(data['updatedAt']),
    updatedByName: text(data['updatedByName']),
  };
}

/** Maior prioridade primeiro; empate, ordem alfabética. Mesma ordem do app. */
export function sortPartners(partners: readonly Partner[]): Partner[] {
  return [...partners].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'pt-BR'));
}

// ── formulário ─────────────────────────────────────────────────────────────

export function emptyPartnerForm(): PartnerForm {
  return {
    name: '',
    category: 'food',
    logoUrl: null,
    brandColor: DEFAULT_BRAND_COLOR,
    cities: '',
    benefitHighlight: '',
    benefitTitle: '',
    description: '',
    howToUse: '',
    terms: '',
    ctaType: 'link',
    ctaLabel: '',
    link: '',
    couponMode: 'none',
    couponCode: '',
    leadConsentText: '',
    leadSuccessMessage: '',
    audience: 'testers',
    priority: '0',
    active: false,
    isMasterSponsor: false,
    coverUrl: null,
    startsAt: '',
    validUntil: '',
    featured: false,
    placements: [],
    couponUrlParam: '',
    termsTags: [],
    locations: [],
    requirementType: 'none',
    tournamentIds: [],
    minLevel: '',
    requirementLabel: '',
  };
}

/**
 * Form de um parceiro gravado. Com requisito, o cupom fixo mora em `partnerPrivate` (o público é
 * `null`): passe o código privado em `privateCoupon`.
 */
export function formFromPartner(p: Partner, privateCoupon: string | null = null): PartnerForm {
  const req = p.requirement;
  return {
    name: p.name,
    category: p.category,
    logoUrl: p.logoUrl,
    brandColor: p.brandColor,
    cities: p.cities.join(', '),
    benefitHighlight: p.benefitHighlight,
    benefitTitle: p.benefitTitle,
    description: p.description,
    howToUse: p.howToUse.join('\n'),
    terms: p.terms,
    ctaType: p.ctaType,
    ctaLabel: p.ctaLabel,
    link: p.link ?? '',
    couponMode: p.couponMode,
    couponCode: (req.type === 'none' ? p.couponCode : (privateCoupon ?? p.couponCode)) ?? '',
    leadConsentText: p.leadConsentText ?? '',
    leadSuccessMessage: p.leadSuccessMessage ?? '',
    audience: p.audience,
    priority: String(p.priority),
    active: p.active,
    isMasterSponsor: p.isMasterSponsor,
    coverUrl: p.coverUrl,
    startsAt: dateInputValue(p.startsAt),
    validUntil: dateInputValue(p.validUntil),
    featured: p.featured,
    placements: [...p.placements],
    couponUrlParam: p.couponUrlParam ?? '',
    termsTags: [...p.termsTags],
    locations: p.locations.map(locationForm),
    requirementType: req.type,
    tournamentIds: req.type === 'tournament' ? [...req.tournamentIds] : [],
    minLevel: req.type === 'min_level' ? req.minLevel : '',
    requirementLabel: p.requirementLabel ?? '',
  };
}

/** "Goiânia, Anápolis , goiânia" → ["Goiânia", "Anápolis"] (sem repetir, ignorando caixa). */
export function parseCities(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const city = part.trim().replace(/\s+/g, ' ');
    const key = city.toLocaleLowerCase('pt-BR');
    if (city !== '' && !seen.has(key)) {
      seen.add(key);
      out.push(city);
    }
  }
  return out;
}

/** Um passo por linha, sem linha vazia. */
export function parseSteps(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** "#5e1e7a" e "5E1E7A" viram "#5E1E7A"; o resto volta como veio (e a validação recusa). */
export function normalizeColor(raw: string): string {
  const t = raw.trim();
  const withHash = t.startsWith('#') ? t : `#${t}`;
  return COLOR_PATTERN.test(withHash) ? withHash.toUpperCase() : t;
}

export function isValidColor(raw: string): boolean {
  return COLOR_PATTERN.test(normalizeColor(raw));
}

function parsePriority(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function tooLong(value: string, max: number): string {
  return `Até ${max} caracteres (tem ${value.length}).`;
}

/**
 * Erros por campo, em português. Vazio = pode gravar. Espelha a rule `partnerValid`, mais duas
 * exigências do app: link para ativar um parceiro de link (sem ele o botão não leva a lugar
 * nenhum; parceiro desligado pode ficar sem, como o seed da Fast Açaí) e código no cupom fixo.
 */
export function validatePartnerForm(form: PartnerForm): PartnerFormErrors {
  const errors: PartnerFormErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'Informe o nome do parceiro.';
  else if (name.length > NAME_MAX) errors.name = tooLong(name, NAME_MAX);

  if (form.logoUrl !== null && (!HTTPS_PATTERN.test(form.logoUrl) || form.logoUrl.length > URL_MAX)) {
    errors.logoUrl = 'Logo inválida. Envie o arquivo de novo.';
  }
  if (!isValidColor(form.brandColor)) errors.brandColor = 'Use o formato #RRGGBB, como #5E1E7A.';
  if (parseCities(form.cities).length > CITIES_MAX) errors.cities = `No máximo ${CITIES_MAX} cidades.`;

  const highlight = form.benefitHighlight.trim();
  if (highlight.length > HIGHLIGHT_MAX) errors.benefitHighlight = tooLong(highlight, HIGHLIGHT_MAX);
  const title = form.benefitTitle.trim();
  if (title === '') errors.benefitTitle = 'Descreva o benefício.';
  else if (title.length > BENEFIT_TITLE_MAX) errors.benefitTitle = tooLong(title, BENEFIT_TITLE_MAX);
  const description = form.description.trim();
  if (description.length > DESCRIPTION_MAX) errors.description = tooLong(description, DESCRIPTION_MAX);
  if (parseSteps(form.howToUse).length > HOW_TO_USE_MAX) errors.howToUse = `No máximo ${HOW_TO_USE_MAX} passos, um por linha.`;
  const terms = form.terms.trim();
  if (terms.length > TERMS_MAX) errors.terms = tooLong(terms, TERMS_MAX);

  const ctaLabel = form.ctaLabel.trim();
  if (ctaLabel === '') errors.ctaLabel = 'Informe o texto do botão.';
  else if (ctaLabel.length > CTA_LABEL_MAX) errors.ctaLabel = tooLong(ctaLabel, CTA_LABEL_MAX);

  if (form.ctaType === 'link') {
    const link = form.link.trim();
    if (link === '' && form.active) errors.link = 'Informe o link (https://) para ativar o parceiro.';
    else if (link !== '' && !HTTPS_PATTERN.test(link)) errors.link = 'O link precisa começar com https://';
    else if (link.length > URL_MAX) errors.link = tooLong(link, URL_MAX);
  } else {
    const consent = form.leadConsentText.trim();
    if (consent.length > CONSENT_TEXT_MAX) errors.leadConsentText = tooLong(consent, CONSENT_TEXT_MAX);
    const success = form.leadSuccessMessage.trim();
    if (success.length > SUCCESS_MESSAGE_MAX) errors.leadSuccessMessage = tooLong(success, SUCCESS_MESSAGE_MAX);
  }

  if (form.couponMode === 'fixed') {
    const code = form.couponCode.trim();
    if (code === '') errors.couponCode = 'Informe o código do cupom.';
    else if (code.length > COUPON_CODE_MAX) errors.couponCode = tooLong(code, COUPON_CODE_MAX);
  }

  if (parsePriority(form.priority) === null) errors.priority = 'Use um número, como 50.';
  return { ...errors, ...validatePremium(form) };
}

/** Os campos da v2: capa, validade, cupom na URL, lugares e requisito. */
function validatePremium(form: PartnerForm): PartnerFormErrors {
  const errors: PartnerFormErrors = {};
  if (form.coverUrl !== null && (!HTTPS_PATTERN.test(form.coverUrl) || form.coverUrl.length > URL_MAX)) {
    errors.coverUrl = 'Capa inválida. Envie o arquivo de novo.';
  }
  const validity = validityError(form.startsAt, form.validUntil);
  if (validity) errors[validity.field] = validity.message;
  const param = form.couponUrlParam.trim();
  if (param !== '' && !COUPON_URL_PARAM_PATTERN.test(param)) {
    errors.couponUrlParam = 'Só letras, números e _ (até 30), como coupon ou cupom.';
  }
  if (form.locations.length > LOCATIONS_MAX) errors.locations = `No máximo ${LOCATIONS_MAX} lugares.`;
  else {
    const at = locationErrors(form.locations).findIndex((e) => e !== null);
    if (at >= 0) errors.locations = `Lugar ${at + 1}: ${locationErrors(form.locations)[at]}`;
  }
  const req = requirementError(form.requirementType, form.tournamentIds, form.minLevel);
  if (req) {
    if (form.requirementType === 'tournament') errors.tournamentIds = req;
    else errors.minLevel = req;
  }
  const label = form.requirementLabel.trim();
  if (form.requirementType !== 'none' && label.length > REQUIREMENT_LABEL_MAX) {
    errors.requirementLabel = tooLong(label, REQUIREMENT_LABEL_MAX);
  }
  return errors;
}

/**
 * O doc gravado, com os campos da allowlist (menos autoria). Campos de outro tipo de botão vão
 * `null`: o link só existe no tipo link; consentimento e mensagem, só no formulário; o código, só
 * no cupom fixo. Com requisito (≠ Todos), o código público é `null`: ele vai para
 * `partnerPrivate` (`privateCouponCode`). Assuma o form validado.
 */
export function partnerPayload(form: PartnerForm): PartnerPayload {
  const isLink = form.ctaType === 'link';
  const requirement = requirementPayload(form.requirementType, form.tournamentIds, form.minLevel);
  const fixedCode = form.couponMode === 'fixed' ? form.couponCode.trim() : null;
  const param = form.couponUrlParam.trim();
  return {
    name: form.name.trim(),
    logoUrl: form.logoUrl,
    category: form.category,
    benefitHighlight: form.benefitHighlight.trim(),
    benefitTitle: form.benefitTitle.trim(),
    description: form.description.trim(),
    howToUse: parseSteps(form.howToUse),
    terms: form.terms.trim(),
    ctaType: form.ctaType,
    ctaLabel: form.ctaLabel.trim(),
    link: isLink ? form.link.trim() || null : null,
    couponMode: form.couponMode,
    couponCode: requirement.type === 'none' ? fixedCode : null,
    brandColor: normalizeColor(form.brandColor),
    cities: parseCities(form.cities),
    isMasterSponsor: form.isMasterSponsor,
    priority: parsePriority(form.priority) ?? 0,
    active: form.active,
    audience: form.audience,
    leadConsentText: isLink ? null : form.leadConsentText.trim() || null,
    leadSuccessMessage: isLink ? null : form.leadSuccessMessage.trim() || null,
    coverUrl: form.coverUrl,
    startsAt: form.startsAt.trim() === '' ? null : startOfLocalDay(form.startsAt),
    validUntil: form.validUntil.trim() === '' ? null : endOfLocalDay(form.validUntil),
    featured: form.featured,
    placements: subsetOf(form.placements, PLACEMENTS),
    // O cupom só vai na URL de um link com cupom.
    couponUrlParam: isLink && form.couponMode !== 'none' && param !== '' ? param : null,
    termsTags: subsetOf(form.termsTags, TERMS_TAGS),
    locations: locationsPayload(form.locations),
    requirement,
    requirementLabel: requirement.type === 'none' ? null : form.requirementLabel.trim() || null,
  };
}

/**
 * O que vai para `partnerPrivate/{id}.couponCode`: o código fixo de parceiro com requisito; `null`
 * nos outros casos (sem requisito o código é público, e o privado é limpo).
 */
export function privateCouponCode(form: PartnerForm): string | null {
  if (form.requirementType === 'none' || form.couponMode !== 'fixed') return null;
  return form.couponCode.trim() || null;
}

/**
 * Doc inteiro de um parceiro já lido, com uma mudança (o toggle Ativo da tabela). Passa pela mesma
 * validação do editor: devolve o primeiro erro quando o cadastro está incompleto para isso.
 */
export function payloadWith(partner: Partner, change: Partial<PartnerForm>): PartnerPayload | { error: string } {
  const form = { ...formFromPartner(partner), ...change };
  const { couponCode, ...others } = validatePartnerForm(form);
  // Com requisito, o código fixo está em `partnerPrivate`, que este doc não toca.
  const errors = partner.requirement.type === 'none' ? { couponCode, ...others } : others;
  const first = Object.values(errors).find((e) => !!e);
  return first ? { error: first } : partnerPayload(form);
}

// ── id ─────────────────────────────────────────────────────────────────────

/** "Fast Açaí" → "fast-acai". Só `a-z`, `0-9` e hífen, até 60. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PARTNER_ID_MAX)
    .replace(/-+$/g, '');
}

/** Slug do nome que ainda não existe: "fast-acai", "fast-acai-2"... `null` se o nome não der slug. */
export function uniquePartnerId(name: string, existing: ReadonlySet<string>): string | null {
  const base = slugify(name);
  if (base === '' || base === NEW_PARTNER_ROUTE_ID) {
    return base === NEW_PARTNER_ROUTE_ID ? uniquePartnerId(`${name} parceiro`, existing) : null;
  }
  if (!existing.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, PARTNER_ID_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return null;
}

export function isValidPartnerId(id: string): boolean {
  return PARTNER_ID_PATTERN.test(id) && id !== NEW_PARTNER_ROUTE_ID;
}

// ── apresentação ───────────────────────────────────────────────────────────

/** "Fast Açaí" → "FA"; "LinQ Telecom" → "LT"; "Nike" → "NI". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, '');
  if (words.length === 1) return letters(words[0]!).slice(0, 2).toUpperCase();
  return (letters(words[0]!).charAt(0) + letters(words[1]!).charAt(0)).toUpperCase();
}

/** O que o botão faz, numa linha: "Link + cupom NEXAGO10", "Formulário". */
export function ctaSummary(p: Pick<Partner, 'ctaType' | 'couponMode' | 'couponCode'>): string {
  const base = p.ctaType === 'link' ? 'Link' : 'Formulário';
  if (p.couponMode === 'fixed' && p.couponCode) return `${base} + cupom ${p.couponCode}`;
  if (p.couponMode === 'athlete') return `${base} + cupom por atleta`;
  return base;
}

/** Texto branco ou escuro sobre a cor da marca (contraste pela luminância). */
export function textOnColor(color: string): '#FFFFFF' | '#0A0A0A' {
  const hex = normalizeColor(color);
  if (!COLOR_PATTERN.test(hex)) return '#FFFFFF';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#0A0A0A' : '#FFFFFF';
}

// ── logo ───────────────────────────────────────────────────────────────────

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };
/** Mesmo teto da rule do Storage (`app/partners/`): menor que 2 MB. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** O que o arquivo tem de errado para subir, ou `null`. */
export function logoFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(file.type in LOGO_TYPES)) return 'Use PNG (de preferência com fundo transparente), WebP ou JPG.';
  return file.size >= LOGO_MAX_BYTES ? 'A logo passa de 2 MB.' : null;
}

/**
 * Caminho no Storage, com nome único por envio (`app/partners/<id>-<timestamp>.<ext>`): trocar a
 * logo nunca serve a antiga do cache do app.
 */
export function logoStoragePath(partnerId: string, fileType: string, now: Date): string {
  const ext = LOGO_TYPES[fileType] ?? 'png';
  const id = partnerId && PARTNER_ID_PATTERN.test(partnerId) ? partnerId : 'parceiro';
  return `app/partners/${id}-${now.getTime()}.${ext}`;
}
