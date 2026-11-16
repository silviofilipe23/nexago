/**
 * Clube de Vantagens Nexa, versão premium (v2): os campos novos de `partners/{partnerId}` (spec
 * `docs/product/vantagens-nexago-spec.md`, seção "Versão premium"). Funções puras; `partner.ts`
 * monta o form e o payload com elas.
 */
import { LEVEL_OPTIONS, type LevelCode } from '@nexago/levels';

export const PLACEMENTS = ['post_game', 'tournament_day'] as const;
export type PartnerPlacement = (typeof PLACEMENTS)[number];

export const PLACEMENT_LABELS: Record<PartnerPlacement, string> = {
  post_game: 'Pós-jogo',
  tournament_day: 'Dia de torneio',
};

export const TERMS_TAGS = ['online', 'in_store', 'not_cumulative', 'unlimited', 'first_order', 'one_per_person'] as const;
export type PartnerTermsTag = (typeof TERMS_TAGS)[number];

export const TERMS_TAG_LABELS: Record<PartnerTermsTag, string> = {
  online: 'Online',
  in_store: 'Na loja',
  not_cumulative: 'Não cumulativo',
  unlimited: 'Uso ilimitado',
  first_order: 'Primeiro pedido',
  one_per_person: 'Um por pessoa',
};

export const REQUIREMENT_TYPES = ['none', 'squad', 'tournament', 'min_level'] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const REQUIREMENT_LABELS: Record<RequirementType, string> = {
  none: 'Todos',
  squad: 'Squad',
  tournament: 'Inscritos em torneios',
  min_level: 'Nível mínimo',
};

export type PartnerRequirement =
  | { type: 'none' }
  | { type: 'squad' }
  | { type: 'tournament'; tournamentIds: string[] }
  | { type: 'min_level'; minLevel: LevelCode };

export interface PartnerLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
  hours: string | null;
}

/** Linha editável de "Lugares": lat e lng como texto até gravar. */
export interface LocationForm {
  name: string;
  address: string;
  lat: string;
  lng: string;
  hours: string;
}

// Limites do contrato (os de lugar não estão no contrato: teto razoável para a tela do app).
export const LOCATIONS_MAX = 20;
export const LOCATION_NAME_MAX = 80;
export const LOCATION_ADDRESS_MAX = 160;
export const LOCATION_HOURS_MAX = 80;
export const REQUIREMENT_LABEL_MAX = 80;
export const TOURNAMENT_IDS_MAX = 10;
export const COUPON_URL_PARAM_PATTERN = /^[A-Za-z0-9_]{1,30}$/;
/** "Novo" = criado nos últimos 14 dias; "Termina em" nos 7 dias antes do fim. */
export const NEW_BADGE_DAYS = 14;
export const ENDING_BADGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOURNAMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const LEVEL_CODES = LEVEL_OPTIONS.map((l) => l.code) as readonly string[];

export const LEVEL_CHOICES = LEVEL_OPTIONS.map((l) => ({ code: l.code, label: l.label }));

export function levelLabel(code: string): string {
  return LEVEL_OPTIONS.find((l) => l.code === code)?.label ?? code;
}

// ── leitura ────────────────────────────────────────────────────────────────

/** Só os valores conhecidos, sem repetir, na ordem fixa da lista. */
export function subsetOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const raw = Array.isArray(value) ? value : [];
  return allowed.filter((a) => raw.includes(a));
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function locationsFromDoc(value: unknown): PartnerLocation[] {
  if (!Array.isArray(value)) return [];
  const out: PartnerLocation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const lat = finite(d['lat']);
    const lng = finite(d['lng']);
    const name = typeof d['name'] === 'string' ? d['name'].trim() : '';
    if (lat === null || lng === null || name === '') continue;
    const hours = typeof d['hours'] === 'string' && d['hours'].trim() !== '' ? d['hours'].trim() : null;
    out.push({ name, address: typeof d['address'] === 'string' ? d['address'].trim() : '', lat, lng, hours });
  }
  return out.slice(0, LOCATIONS_MAX);
}

/** Requisito ausente ou de tipo desconhecido = Todos. */
export function requirementFromDoc(value: unknown): PartnerRequirement {
  if (!value || typeof value !== 'object') return { type: 'none' };
  const d = value as Record<string, unknown>;
  switch (d['type']) {
    case 'squad':
      return { type: 'squad' };
    case 'tournament': {
      const ids = Array.isArray(d['tournamentIds'])
        ? d['tournamentIds'].filter((id): id is string => typeof id === 'string' && TOURNAMENT_ID_PATTERN.test(id))
        : [];
      return { type: 'tournament', tournamentIds: [...new Set(ids)].slice(0, TOURNAMENT_IDS_MAX) };
    }
    case 'min_level': {
      const level = d['minLevel'];
      return typeof level === 'string' && LEVEL_CODES.includes(level)
        ? { type: 'min_level', minLevel: level as LevelCode }
        : { type: 'min_level', minLevel: 'iniciante_1' };
    }
    default:
      return { type: 'none' };
  }
}

// ── datas (input type=date, no fuso local) ─────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data → "2026-11-30" (dia local); `null` → "". */
export function dateInputValue(date: Date | null): string {
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDate(raw: string, endOfDay: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = endOfDay ? new Date(y, mo, d, 23, 59, 59, 999) : new Date(y, mo, d);
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d ? date : null;
}

/** Início: meia-noite local do dia escolhido. */
export function startOfLocalDay(raw: string): Date | null {
  return localDate(raw, false);
}

/** Fim: o dia escolhido vale inteiro (23:59:59,999 local). */
export function endOfLocalDay(raw: string): Date | null {
  return localDate(raw, true);
}

export interface ValidityError {
  field: 'startsAt' | 'validUntil';
  message: string;
}

/** Erro da validade, ou `null`. Os dois são opcionais; com os dois, fim ≥ início. */
export function validityError(startsAt: string, validUntil: string): ValidityError | null {
  const start = startsAt.trim() === '' ? null : startOfLocalDay(startsAt);
  const end = validUntil.trim() === '' ? null : endOfLocalDay(validUntil);
  if (startsAt.trim() !== '' && !start) return { field: 'startsAt', message: 'Data de início inválida.' };
  if (validUntil.trim() !== '' && !end) return { field: 'validUntil', message: 'Data de fim inválida.' };
  if (start && end && end.getTime() < start.getTime()) {
    return { field: 'validUntil', message: 'O fim precisa ser no mesmo dia do início ou depois.' };
  }
  return null;
}

// ── selos ──────────────────────────────────────────────────────────────────

/** "Termina hoje", "Termina amanhã", "Termina em N dias" nos 7 dias antes do fim; senão `null`. */
export function endingLabel(validUntil: Date | null, now: Date): string | null {
  if (!validUntil || validUntil.getTime() < now.getTime()) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endDay = new Date(validUntil.getFullYear(), validUntil.getMonth(), validUntil.getDate()).getTime();
  const days = Math.round((endDay - today) / DAY_MS);
  if (days > ENDING_BADGE_DAYS) return null;
  if (days <= 0) return 'Termina hoje';
  return days === 1 ? 'Termina amanhã' : `Termina em ${days} dias`;
}

export function isNewPartner(createdAt: Date | null, now: Date): boolean {
  return !!createdAt && now.getTime() - createdAt.getTime() <= NEW_BADGE_DAYS * DAY_MS;
}

/** Os selos da vitrine, na ordem do app. Parceiro novo (sem `createdAt`) já conta como Novo. */
export function partnerBadges(
  p: { createdAt: Date | null; validUntil: Date | null; featured: boolean },
  now: Date,
  unsaved = false,
): string[] {
  const badges: string[] = [];
  if (p.featured) badges.push('Destaque da semana');
  if (unsaved || isNewPartner(p.createdAt, now)) badges.push('Novo');
  const ending = endingLabel(p.validUntil, now);
  if (ending) badges.push(ending);
  return badges;
}

/** A janela de validade não inclui `now` (ainda não começou ou já acabou). */
export function outsideWindow(startsAt: Date | null, validUntil: Date | null, now: Date): 'before' | 'after' | null {
  if (startsAt && now.getTime() < startsAt.getTime()) return 'before';
  if (validUntil && now.getTime() > validUntil.getTime()) return 'after';
  return null;
}

// ── lugares ────────────────────────────────────────────────────────────────

export function emptyLocation(): LocationForm {
  return { name: '', address: '', lat: '', lng: '', hours: '' };
}

export function locationForm(l: PartnerLocation): LocationForm {
  return { name: l.name, address: l.address, lat: String(l.lat), lng: String(l.lng), hours: l.hours ?? '' };
}

/** "-16,6869" e "-16.6869" valem; fora de [min, max] ou texto = `null`. */
export function parseCoordinate(raw: string, min: number, max: number): number | null {
  const t = raw.trim().replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Um erro por lugar (`null` = ok), na ordem da lista. */
export function locationErrors(list: readonly LocationForm[]): Array<string | null> {
  return list.map((l) => {
    if (l.name.trim() === '') return 'Informe o nome do lugar.';
    if (l.name.trim().length > LOCATION_NAME_MAX) return `Nome: até ${LOCATION_NAME_MAX} caracteres.`;
    if (l.address.trim() === '') return 'Informe o endereço.';
    if (l.address.trim().length > LOCATION_ADDRESS_MAX) return `Endereço: até ${LOCATION_ADDRESS_MAX} caracteres.`;
    const lat = parseCoordinate(l.lat, -90, 90);
    const lng = parseCoordinate(l.lng, -180, 180);
    if (lat === null) return 'Latitude entre -90 e 90, como -16.6869.';
    if (lng === null) return 'Longitude entre -180 e 180, como -49.2648.';
    if (lat === 0 && lng === 0) return 'Latitude e longitude 0,0 não é um endereço: confira no mapa.';
    if (l.hours.trim().length > LOCATION_HOURS_MAX) return `Horário: até ${LOCATION_HOURS_MAX} caracteres.`;
    return null;
  });
}

/** Assuma os lugares validados. */
export function locationsPayload(list: readonly LocationForm[]): PartnerLocation[] {
  return list.slice(0, LOCATIONS_MAX).map((l) => ({
    name: l.name.trim(),
    address: l.address.trim(),
    lat: parseCoordinate(l.lat, -90, 90) ?? 0,
    lng: parseCoordinate(l.lng, -180, 180) ?? 0,
    hours: l.hours.trim() || null,
  }));
}

// ── requisito ──────────────────────────────────────────────────────────────

export function requirementPayload(type: RequirementType, tournamentIds: readonly string[], minLevel: string): PartnerRequirement {
  switch (type) {
    case 'squad':
      return { type: 'squad' };
    case 'tournament':
      return { type: 'tournament', tournamentIds: [...new Set(tournamentIds)].slice(0, TOURNAMENT_IDS_MAX) };
    case 'min_level':
      return { type: 'min_level', minLevel: (LEVEL_CODES.includes(minLevel) ? minLevel : 'iniciante_1') as LevelCode };
    default:
      return { type: 'none' };
  }
}

/** O que falta no requisito, ou `null`. */
export function requirementError(type: RequirementType, tournamentIds: readonly string[], minLevel: string): string | null {
  if (type === 'tournament') {
    if (tournamentIds.length === 0) return 'Escolha ao menos um torneio.';
    if (tournamentIds.length > TOURNAMENT_IDS_MAX) return `No máximo ${TOURNAMENT_IDS_MAX} torneios.`;
    if (tournamentIds.some((id) => !TOURNAMENT_ID_PATTERN.test(id))) return 'Id de torneio inválido.';
  }
  if (type === 'min_level' && !LEVEL_CODES.includes(minLevel)) return 'Escolha o nível mínimo.';
  return null;
}

/** Texto padrão do bloqueio quando a equipe deixa o campo vazio. */
export function defaultRequirementLabel(req: PartnerRequirement): string | null {
  switch (req.type) {
    case 'squad':
      return 'Exclusivo para embaixadores do Squad';
    case 'tournament':
      return 'Exclusivo para inscritos no torneio';
    case 'min_level':
      return `Exclusivo para nível ${levelLabel(req.minLevel)} ou acima`;
    default:
      return null;
  }
}

/** "Inscritos em 2 torneios", "Nível Avançado 1+" (tabela e prévia). */
export function requirementSummary(req: PartnerRequirement): string {
  switch (req.type) {
    case 'squad':
      return 'Squad';
    case 'tournament':
      return `Inscritos em ${req.tournamentIds.length} torneio${req.tournamentIds.length === 1 ? '' : 's'}`;
    case 'min_level':
      return `Nível ${levelLabel(req.minLevel)}+`;
    default:
      return 'Todos';
  }
}

/** Ids colados: separados por vírgula, espaço ou linha, sem repetir. */
export function parseIds(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s !== ''))];
}

// ── capa ───────────────────────────────────────────────────────────────────

const COVER_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
/** Mesmo teto da rule do Storage (`app/partners/`): menor que 2 MB. */
export const COVER_MAX_BYTES = 2 * 1024 * 1024;

export function coverFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(file.type in COVER_TYPES)) return 'Use JPG, WebP ou PNG.';
  return file.size >= COVER_MAX_BYTES ? 'A capa passa de 2 MB. Exporte em 1600×900 com qualidade 80.' : null;
}

/** `app/partners/<id>-cover-<timestamp>.<ext>`: trocar a capa nunca serve a antiga do cache. */
export function coverStoragePath(partnerId: string, fileType: string, now: Date): string {
  const ext = COVER_TYPES[fileType] ?? 'jpg';
  const id = /^[a-z0-9-]{1,60}$/.test(partnerId) ? partnerId : 'parceiro';
  return `app/partners/${id}-cover-${now.getTime()}.${ext}`;
}

/** Quão longe a imagem está de 16:9 (0 = exato). Acima de 0,05 a tela avisa que vai cortar. */
export function aspectDrift(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.abs(width / height - 16 / 9) / (16 / 9);
}

// ── avisar atletas (`notifyBenefitPartner`) ────────────────────────────────

export type NotifyKind = 'new' | 'ending';

export const NOTIFY_LABELS: Record<NotifyKind, string> = { new: 'Parceiro novo', ending: 'Oferta acabando' };

export interface NotifyContext {
  saved: boolean;
  dirty: boolean;
  active: boolean;
  validUntil: Date | null;
}

/** Por que o botão está desligado, ou `null` (pode avisar). */
export function notifyBlocker(kind: NotifyKind, ctx: NotifyContext, now: Date): string | null {
  if (!ctx.saved) return 'Salve o parceiro antes de avisar.';
  if (ctx.dirty) return 'Salve as alterações antes de avisar: o push leva o que está gravado.';
  if (!ctx.active) return 'Ative o parceiro antes de avisar.';
  if (kind === 'ending') {
    if (!ctx.validUntil) return 'Defina a data de fim para avisar que a oferta está acabando.';
    if (ctx.validUntil.getTime() < now.getTime()) return 'A oferta já terminou.';
  }
  return null;
}

/** Resposta da callable com campo faltando vira 0. */
export function notifyResultOf(data: unknown): { recipients: number; sent: number } {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof d[k] === 'number' && Number.isFinite(d[k]) ? (d[k] as number) : 0);
  return { recipients: n('recipients'), sent: n('sent') };
}

/** "Vai para 1 pessoa", "Vai para 1.234 pessoas". */
export function recipientsLabel(count: number): string {
  return `Vai para ${count.toLocaleString('pt-BR')} ${count === 1 ? 'pessoa' : 'pessoas'}`;
}
