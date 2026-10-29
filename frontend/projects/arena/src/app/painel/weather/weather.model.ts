import { formatBRL } from '../bookings/arena-booking.model';
import type { PillTone } from '../ui/pill.component';

/** Cancelamento por chuva (Modo chuva + créditos de clima) — contrato em
 *  `docs/superpowers/specs/2026-10-29-cancelamento-por-chuva-design.md`. Tudo aqui é puro:
 *  parsers tolerantes dos docs/respostas e as contas que as 4 telas exibem. */

// ── Leitura tolerante ────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

function pick<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Timestamp do Firestore (`toDate`), Timestamp serializado pela callable (`_seconds`/`seconds`),
 *  ISO, epoch em ms ou `Date`. Qualquer outra coisa vira `null`. */
export function toDateValue(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? new Date(v) : null;
  if (typeof v === 'object') {
    const o = v as { toDate?: unknown; seconds?: unknown; _seconds?: unknown };
    if (typeof o.toDate === 'function') {
      const d = (o.toDate as () => unknown).call(v);
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    const seconds = num(o.seconds) ?? num(o._seconds);
    if (seconds != null) return new Date(seconds * 1000);
  }
  return null;
}

// ── Datas e horas ────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKeyFrom(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dateFromKey(dateKey: string): Date | null {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const d = dateFromKey(dateKey);
  if (!d) return dateKey;
  return dateKeyFrom(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** "Ter 28 Out" — sem o ponto que o `Intl` põe no mês abreviado. */
export function shortDateLabel(dateKey: string): string {
  const d = dateFromKey(dateKey);
  if (!d) return dateKey;
  return `${WEEKDAY_SHORT[d.getDay()]} ${pad2(d.getDate())} ${MONTH_SHORT[d.getMonth()]}`;
}

/** "28 Out". */
export function dayMonthLabel(dateKey: string): string {
  const d = dateFromKey(dateKey);
  if (!d) return dateKey;
  return `${pad2(d.getDate())} ${MONTH_SHORT[d.getMonth()]}`;
}

/** "27 Jan 2027". */
export function fullDateLabel(date: Date | null): string {
  if (!date) return '—';
  return `${pad2(date.getDate())} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "outubro" — mês corrente por extenso, para o rótulo dos KPIs. */
export function monthLongLabel(date: Date): string {
  return MONTH_LONG[date.getMonth()] ?? '';
}

/** "Hoje · Qua 29 Out" / "Amanhã · Qui 30 Out" / "Sex 31 Out". */
export function dayHeadingLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return `Hoje · ${shortDateLabel(dateKey)}`;
  if (dateKey === addDaysToKey(todayKey, 1)) return `Amanhã · ${shortDateLabel(dateKey)}`;
  return shortDateLabel(dateKey);
}

export function timeOfHour(hour: number): string {
  return `${pad2(hour)}:00`;
}

/** "17:30" → 17. Hora inválida vira `NaN`. */
export function hourOf(time: string): number {
  const h = Number(time.split(':')[0]);
  return Number.isInteger(h) ? h : Number.NaN;
}

export function hourRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let h = from; h <= to; h++) out.push(h);
  return out;
}

/** "há 12 min" / "há 3h" / "há 2 dias". */
export function relativeTimeLabel(date: Date | null, now: Date): string {
  if (!date) return '—';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** "Quadra 2" → "Q2"; nome fora desse padrão fica como está. */
export function shortCourtName(name: string): string {
  const match = /^quadra\s*(\S+)$/i.exec(name.trim());
  return match ? `Q${match[1]}` : name.trim();
}

/** "Q2 · Ter 28 Out · 18:00" — referência curta de uma reserva. */
export function bookingRefLabel(courtName: string, dateKey: string, startTime: string): string {
  return `${shortCourtName(courtName)} · ${shortDateLabel(dateKey)} · ${startTime}`;
}

// ── Política (`arenas/{id}.weatherPolicy`) ──────────────────────────────────

export const WEATHER_RESCHEDULE_DAYS = [15, 30, 60] as const;
export type WeatherRescheduleDays = (typeof WEATHER_RESCHEDULE_DAYS)[number];

export const WEATHER_CREDIT_VALIDITY = [60, 90, 180, null] as const;
export type WeatherCreditValidity = (typeof WEATHER_CREDIT_VALIDITY)[number];

export const WEATHER_TRIGGERS = ['arena', 'request', 'auto'] as const;
export type WeatherTrigger = (typeof WEATHER_TRIGGERS)[number];

export const WEATHER_REQUEST_DEADLINES = ['before_2h', 'start', 'after_30m'] as const;
export type WeatherRequestDeadline = (typeof WEATHER_REQUEST_DEADLINES)[number];

export const WEATHER_MID_GAME = ['proportional', 'none'] as const;
export type WeatherMidGame = (typeof WEATHER_MID_GAME)[number];

export interface WeatherPolicy {
  enabled: boolean;
  allowReschedule: boolean;
  rescheduleDays: WeatherRescheduleDays;
  /** `null` = sem validade. */
  creditValidityDays: WeatherCreditValidity;
  trigger: WeatherTrigger;
  requestDeadline: WeatherRequestDeadline;
  midGame: WeatherMidGame;
  /** `null` = todas as quadras. */
  courtIds: string[] | null;
}

export const DEFAULT_WEATHER_POLICY: Readonly<WeatherPolicy> = {
  enabled: false,
  allowReschedule: true,
  rescheduleDays: 30,
  creditValidityDays: 90,
  trigger: 'arena',
  requestDeadline: 'start',
  midGame: 'proportional',
  courtIds: null,
};

/** Mesmos defaults da callable `saveArenaWeatherPolicy`. Campo ausente ou fora do domínio cai no
 *  padrão; `creditValidityDays: null` explícito é "sem validade" (ausente é 90). */
export function normalizeWeatherPolicy(raw: unknown): WeatherPolicy {
  const d = asRecord(raw);
  const validity: WeatherCreditValidity =
    'creditValidityDays' in d && d['creditValidityDays'] === null
      ? null
      : pick<WeatherCreditValidity>([60, 90, 180], d['creditValidityDays'], DEFAULT_WEATHER_POLICY.creditValidityDays);
  return {
    enabled: typeof d['enabled'] === 'boolean' ? d['enabled'] : DEFAULT_WEATHER_POLICY.enabled,
    allowReschedule: typeof d['allowReschedule'] === 'boolean' ? d['allowReschedule'] : DEFAULT_WEATHER_POLICY.allowReschedule,
    rescheduleDays: pick(WEATHER_RESCHEDULE_DAYS, d['rescheduleDays'], DEFAULT_WEATHER_POLICY.rescheduleDays),
    creditValidityDays: validity,
    trigger: pick(WEATHER_TRIGGERS, d['trigger'], DEFAULT_WEATHER_POLICY.trigger),
    requestDeadline: pick(WEATHER_REQUEST_DEADLINES, d['requestDeadline'], DEFAULT_WEATHER_POLICY.requestDeadline),
    midGame: pick(WEATHER_MID_GAME, d['midGame'], DEFAULT_WEATHER_POLICY.midGame),
    courtIds: Array.isArray(d['courtIds']) ? [...new Set(strList(d['courtIds']))] : null,
  };
}

export function weatherPolicyFromArenaDoc(arenaDoc: Record<string, unknown> | null): WeatherPolicy {
  return normalizeWeatherPolicy(arenaDoc?.['weatherPolicy']);
}

export const WEATHER_TRIGGER_LABEL: Record<WeatherTrigger, string> = {
  arena: 'Arena · Modo chuva',
  request: 'Atleta pede · arena aprova',
  auto: 'Automático pela previsão',
};

export const WEATHER_DEADLINE_LABEL: Record<WeatherRequestDeadline, string> = {
  before_2h: 'Até 2h antes',
  start: 'Até o início',
  after_30m: 'Até 30 min depois',
};

export const WEATHER_MID_GAME_LABEL: Record<WeatherMidGame, string> = {
  proportional: 'Crédito proporcional ao tempo restante',
  none: 'Não se aplica',
};

export function creditValidityLabel(v: WeatherCreditValidity): string {
  return v == null ? 'Sem validade' : `${v} dias`;
}

export function policyCourtIncluded(courtIds: string[] | null, courtId: string): boolean {
  return courtIds == null || courtIds.includes(courtId);
}

/** Quantas das quadras atuais entram (id de quadra apagada não conta). */
export function policyCourtCount(courtIds: string[] | null, allCourtIds: readonly string[]): number {
  return courtIds == null ? allCourtIds.length : allCourtIds.filter((id) => courtIds.includes(id)).length;
}

/** Marca/desmarca uma quadra. Todas marcadas volta a `null` (= todas, inclusive as que forem
 *  criadas depois); a ordem segue a do cadastro e id de quadra apagada sai. */
export function togglePolicyCourt(
  courtIds: string[] | null,
  courtId: string,
  allCourtIds: readonly string[],
): string[] | null {
  const current = courtIds == null ? [...allCourtIds] : allCourtIds.filter((id) => courtIds.includes(id));
  const next = current.includes(courtId) ? current.filter((id) => id !== courtId) : [...current, courtId];
  if (allCourtIds.length > 0 && allCourtIds.every((id) => next.includes(id))) return null;
  return allCourtIds.filter((id) => next.includes(id));
}

export interface WeatherSummaryLine {
  label: string;
  value: string;
  strong: boolean;
}

/** Card "Resumo" da tela de Política. */
export function weatherPolicySummary(policy: WeatherPolicy, allCourtIds: readonly string[]): WeatherSummaryLine[] {
  const total = allCourtIds.length;
  const courts =
    total === 0
      ? policy.courtIds == null ? 'Todas' : String(policy.courtIds.length)
      : `${policyCourtCount(policy.courtIds, allCourtIds)} de ${total}`;
  return [
    { label: 'Situação', value: policy.enabled ? 'Ligada' : 'Desligada', strong: true },
    { label: 'Aciona', value: WEATHER_TRIGGER_LABEL[policy.trigger], strong: true },
    { label: 'Remarcar', value: policy.allowReschedule ? `${policy.rescheduleDays} dias` : 'Desligado', strong: false },
    { label: 'Crédito', value: creditValidityLabel(policy.creditValidityDays), strong: false },
    { label: 'Reembolso', value: 'Desligado', strong: false },
    { label: 'Prazo', value: WEATHER_DEADLINE_LABEL[policy.requestDeadline], strong: false },
    { label: 'Meio do jogo', value: policy.midGame === 'proportional' ? 'Proporcional' : 'Não se aplica', strong: false },
    { label: 'Quadras', value: courts, strong: false },
  ];
}

const DEADLINE_SENTENCE: Record<WeatherRequestDeadline, string> = {
  before_2h: 'até 2h antes do início',
  start: 'até o horário de início',
  after_30m: 'até 30 min depois do início',
};

/** Texto da prévia "Como o atleta vê", montado da política. */
export function weatherPolicyAthleteText(policy: WeatherPolicy, arenaName: string): string {
  const validity = policy.creditValidityDays == null ? ' sem prazo para usar' : ` por ${policy.creditValidityDays} dias`;
  const choices = policy.allowReschedule
    ? `remarca em até ${policy.rescheduleDays} dias ou guarda o valor como crédito${validity}`
    : `guarda o valor como crédito${validity}`;
  const deadline = DEADLINE_SENTENCE[policy.requestDeadline];
  switch (policy.trigger) {
    case 'arena':
      return `Se a ${arenaName} ativar o Modo chuva, você ${choices}.`;
    case 'request':
      return `Choveu no seu horário? Peça o cancelamento na reserva ${deadline}. Com o pedido aprovado pela ${arenaName}, você ${choices}.`;
    case 'auto':
      return `Choveu no seu horário? Peça o cancelamento na reserva ${deadline}. Com chuva forte na previsão, a liberação sai na hora e você ${choices}.`;
  }
}

// ── Previsão (`getArenaWeatherForecast`) ────────────────────────────────────

export interface WeatherHour {
  /** "HH:00". */
  time: string;
  probability: number | null;
  precipitationMm: number | null;
}

export interface WeatherForecast {
  hours: WeatherHour[];
  fetchedAt: Date | null;
}

/** Limiares do modo automático (Open-Meteo): chuva "valendo" a partir de 2 mm/h e 70%. */
export const RAIN_MM_THRESHOLD = 2;
export const RAIN_PROBABILITY_THRESHOLD = 70;

export function weatherHourFromData(raw: unknown): WeatherHour | null {
  const d = asRecord(raw);
  const time = str(d['time']);
  if (!time || Number.isNaN(hourOf(time))) return null;
  return { time, probability: num(d['probability']), precipitationMm: num(d['precipitationMm']) };
}

/** `forecast` da resposta: `{hours, fetchedAt}` ou `null` (arena sem coordenadas). */
export function weatherForecastFromData(raw: unknown): WeatherForecast | null {
  if (raw == null || typeof raw !== 'object') return null;
  const d = asRecord(raw);
  const hours = (Array.isArray(d['hours']) ? d['hours'] : [])
    .map(weatherHourFromData)
    .filter((h): h is WeatherHour => h != null)
    .sort((a, b) => hourOf(a.time) - hourOf(b.time));
  return { hours, fetchedAt: toDateValue(d['fetchedAt']) };
}

export function hoursBetween(hours: readonly WeatherHour[], fromHour: number, toHour: number): WeatherHour[] {
  return hours.filter((h) => {
    const hour = hourOf(h.time);
    return hour >= fromHour && hour <= toHour;
  });
}

export function isRainyHour(hour: WeatherHour): boolean {
  return (hour.precipitationMm ?? 0) >= RAIN_MM_THRESHOLD;
}

/** Primeira sequência de horas com chuva a partir de `minHour`: sugestão de período. */
export function suggestRainWindow(
  hours: readonly WeatherHour[],
  minHour: number,
): { startHour: number; endHour: number } | null {
  const sorted = [...hours].sort((a, b) => hourOf(a.time) - hourOf(b.time));
  let start: number | null = null;
  let last: number | null = null;
  for (const h of sorted) {
    const hour = hourOf(h.time);
    if (hour < minHour) continue;
    if (isRainyHour(h)) {
      if (start == null) start = hour;
      else if (last != null && hour !== last + 1) break;
      last = hour;
    } else if (start != null) {
      break;
    }
  }
  return start == null || last == null ? null : { startHour: start, endHour: Math.min(last + 1, 24) };
}

/** Faixa de horas do Modo chuva: início 06–23, fim 07–24. */
export const RAIN_MODE_FIRST_HOUR = 6;
export const RAIN_MODE_LAST_HOUR = 24;

export interface RainModePeriod {
  startHour: number;
  endHour: number;
}

/** Período inicial antes da previsão chegar: hoje, da hora cheia atual até +3h; outro dia,
 *  17:00–20:00 (o horário de pico das quadras abertas). */
export function defaultRainModePeriod(dateKey: string, todayKey: string, now: Date): RainModePeriod {
  if (dateKey !== todayKey) return { startHour: 17, endHour: 20 };
  const start = Math.min(Math.max(now.getHours(), RAIN_MODE_FIRST_HOUR), RAIN_MODE_LAST_HOUR - 1);
  return { startHour: start, endHour: Math.min(start + 3, RAIN_MODE_LAST_HOUR) };
}

/** Clique numa barra de hora: o 1º clique começa o período naquela hora (1h); o 2º, numa hora
 *  igual ou posterior, fecha o período nela. Clique antes da âncora recomeça. */
export function applyHourClick(anchor: number | null, hour: number): RainModePeriod & { anchor: number | null } {
  const end = Math.min(hour + 1, RAIN_MODE_LAST_HOUR);
  if (anchor == null || hour < anchor) return { startHour: hour, endHour: end, anchor: hour };
  return { startHour: anchor, endHour: end, anchor: null };
}

/** "14:52". */
export function clockLabel(date: Date | null): string {
  return date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : '—';
}

/** "5,4" — mm com uma casa, vírgula. */
export function formatMm(mm: number | null): string {
  return mm == null ? '—' : mm.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

export function rainIntensityLabel(mm: number | null): string {
  if (mm == null) return 'Sem medição';
  if (mm < 0.1) return 'Sem chuva';
  if (mm < RAIN_MM_THRESHOLD) return 'Chuva fraca';
  if (mm < 5) return 'Chuva moderada';
  return 'Chuva forte';
}

// ── Prévia do Modo chuva (`previewArenaRainMode`) ───────────────────────────

export const AFFECTED_TREATMENTS = ['release', 'partial', 'cancel', 'manual'] as const;
export type AffectedTreatment = (typeof AFFECTED_TREATMENTS)[number];

export const MANUAL_REASONS = ['class', 'club', 'recurring', 'manual', 'pending_payment', 'split', 'already_released'] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

export const MANUAL_REASON_LABEL: Record<ManualReason, string> = {
  class: 'Aula',
  club: 'Clubinho',
  recurring: 'Horário fixo',
  manual: 'Manual',
  pending_payment: 'Pix pendente',
  split: 'Divisão',
  already_released: 'Já liberada',
};

export interface RainModeAffected {
  bookingId: string;
  athleteId: string | null;
  athleteName: string | null;
  courtId: string;
  courtName: string;
  startTime: string;
  endTime: string;
  paidReais: number;
  paymentLabel: string;
  treatment: AffectedTreatment;
  manualReason: ManualReason | null;
  creditableReais: number;
  fraction: number;
}

export interface RainModeTotals {
  release: number;
  partial: number;
  cancel: number;
  manual: number;
  creditableReais: number;
}

export interface RainModePreview {
  bookings: RainModeAffected[];
  totals: RainModeTotals;
}

export function rainModeAffectedFromData(raw: unknown): RainModeAffected | null {
  const d = asRecord(raw);
  const bookingId = str(d['bookingId']);
  if (!bookingId) return null;
  const treatment = pick<AffectedTreatment | null>(AFFECTED_TREATMENTS, d['treatment'], null);
  if (!treatment) return null;
  return {
    bookingId,
    athleteId: str(d['athleteId']),
    athleteName: str(d['athleteName']),
    courtId: str(d['courtId']) ?? '',
    courtName: str(d['courtName']) ?? 'Quadra',
    startTime: str(d['startTime']) ?? '',
    endTime: str(d['endTime']) ?? '',
    paidReais: num(d['paidReais']) ?? 0,
    paymentLabel: str(d['paymentLabel']) ?? '',
    treatment,
    manualReason: treatment === 'manual' ? pick<ManualReason | null>(MANUAL_REASONS, d['manualReason'], null) : null,
    creditableReais: num(d['creditableReais']) ?? 0,
    fraction: num(d['fraction']) ?? 0,
  };
}

export function rainModeTotalsOf(bookings: readonly RainModeAffected[]): RainModeTotals {
  const totals: RainModeTotals = { release: 0, partial: 0, cancel: 0, manual: 0, creditableReais: 0 };
  for (const b of bookings) {
    totals[b.treatment] += 1;
    if (b.treatment === 'release' || b.treatment === 'partial') totals.creditableReais += b.creditableReais;
  }
  totals.creditableReais = Math.round(totals.creditableReais * 100) / 100;
  return totals;
}

/** Resposta da callable. Sem `totals` (ou malformado), recalcula pela lista. */
export function rainModePreviewFromData(raw: unknown): RainModePreview {
  const d = asRecord(raw);
  const bookings = (Array.isArray(d['bookings']) ? d['bookings'] : [])
    .map(rainModeAffectedFromData)
    .filter((b): b is RainModeAffected => b != null)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courtName.localeCompare(b.courtName));
  const t = asRecord(d['totals']);
  const fromList = rainModeTotalsOf(bookings);
  const totals: RainModeTotals =
    num(t['release']) != null
      ? {
          release: num(t['release']) ?? 0,
          partial: num(t['partial']) ?? 0,
          cancel: num(t['cancel']) ?? 0,
          manual: num(t['manual']) ?? 0,
          creditableReais: num(t['creditableReais']) ?? fromList.creditableReais,
        }
      : fromList;
  return { bookings, totals };
}

/** Coluna "Valor" da lista de reservas afetadas. */
export function affectedValueLabel(a: RainModeAffected): string {
  switch (a.treatment) {
    case 'release':
      return formatBRL(a.creditableReais);
    case 'partial':
      return `${formatBRL(a.creditableReais)} (proporcional)`;
    case 'cancel':
      return 'Só cancela';
    case 'manual':
      return 'Tratar à parte';
  }
}

/** Coluna "Pago": sem pagamento (e fora do "tratar à parte") vira o pill "Não pago". */
export function affectedIsUnpaid(a: RainModeAffected): boolean {
  return a.treatment !== 'manual' && a.paidReais <= 0;
}

/** Atletas distintos (com conta) que o Modo chuva avisa — "tratar à parte" não entra. */
export function rainModeNotifiedAthletes(bookings: readonly RainModeAffected[]): number {
  const ids = new Set<string>();
  for (const b of bookings) {
    if (b.treatment !== 'manual' && b.athleteId) ids.add(b.athleteId);
  }
  return ids.size;
}

/** Prévia do aviso quando a arena não escreve mensagem própria. */
export function rainModeDefaultMessage(
  arenaName: string,
  dateKey: string,
  todayKey: string,
  allowReschedule: boolean,
): string {
  const when =
    dateKey === todayKey ? 'hoje' : dateKey === addDaysToKey(todayKey, 1) ? 'amanhã' : `em ${dayMonthLabel(dateKey)}`;
  const options = allowReschedule ? 'pode ser remarcado sem custo ou virar crédito' : 'pode virar crédito';
  return `Chuva na ${arenaName} ${when} — seu horário ${options}. Toque para escolher.`;
}

export interface RainModeActivation {
  eventId: string;
  released: number;
  partial: number;
  canceled: number;
  manual: number;
  notified: number;
}

export function rainModeActivationFromData(raw: unknown): RainModeActivation {
  const d = asRecord(raw);
  return {
    eventId: str(d['eventId']) ?? '',
    released: num(d['released']) ?? 0,
    partial: num(d['partial']) ?? 0,
    canceled: num(d['canceled']) ?? 0,
    manual: num(d['manual']) ?? 0,
    notified: num(d['notified']) ?? 0,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a", "a e b", "a, b e c". */
function joinPt(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function rainModeCountsSentence(release: number, partial: number, cancel: number, manual: number): string {
  const parts = [
    plural(release, 'reserva liberada', 'reservas liberadas'),
    `${partial} com crédito proporcional`,
    plural(cancel, 'não paga cancelada', 'não pagas canceladas'),
  ];
  if (manual > 0) parts.push(`${manual} para tratar à parte`);
  return joinPt(parts);
}

/** Resumo do modal de confirmação. */
export function rainModeTotalsSentence(t: RainModeTotals): string {
  return rainModeCountsSentence(t.release, t.partial, t.cancel, t.manual);
}

export function rainModeActivationMessage(r: RainModeActivation): string {
  const counts = rainModeCountsSentence(r.released, r.partial, r.canceled, r.manual);
  return `Modo chuva ativado: ${counts}. ${plural(r.notified, 'atleta avisado', 'atletas avisados')}.`;
}

// ── Eventos (`arenaWeatherEvents`) ──────────────────────────────────────────

export interface RainModeEventCounts {
  release: number;
  partial: number;
  cancel: number;
  manual: number;
}

export interface RainModeEvent {
  id: string;
  arenaId: string;
  date: string;
  startTime: string;
  endTime: string;
  courtIds: string[];
  blockNewBookings: boolean;
  message: string | null;
  status: 'active' | 'ended';
  createdAt: Date | null;
  endedAt: Date | null;
  counts: RainModeEventCounts;
}

export function rainModeEventFromDoc(id: string, data: Record<string, unknown>): RainModeEvent {
  const c = asRecord(data['counts']);
  return {
    id,
    arenaId: str(data['arenaId']) ?? '',
    date: str(data['date']) ?? '',
    startTime: str(data['startTime']) ?? '',
    endTime: str(data['endTime']) ?? '',
    courtIds: strList(data['courtIds']),
    blockNewBookings: data['blockNewBookings'] === true,
    message: str(data['message']),
    status: data['status'] === 'ended' ? 'ended' : 'active',
    createdAt: toDateValue(data['createdAt']),
    endedAt: toDateValue(data['endedAt']),
    counts: {
      release: num(c['release']) ?? 0,
      partial: num(c['partial']) ?? 0,
      cancel: num(c['cancel']) ?? 0,
      manual: num(c['manual']) ?? 0,
    },
  };
}

export function rainModeEventCountsLabel(c: RainModeEventCounts): string {
  const parts = [
    plural(c.release, 'liberada', 'liberadas'),
    plural(c.partial, 'proporcional', 'proporcionais'),
    plural(c.cancel, 'cancelada', 'canceladas'),
  ];
  if (c.manual > 0) parts.push(`${c.manual} à parte`);
  return parts.join(' · ');
}

// ── Pedidos (`arenaWeatherRequests`) ────────────────────────────────────────

export const WEATHER_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type WeatherRequestStatus = (typeof WEATHER_REQUEST_STATUSES)[number];

export type WeatherRequestTab = 'pending' | 'approved' | 'rejected';
export const WEATHER_REQUEST_TABS: ReadonlyArray<{ id: WeatherRequestTab; label: string }> = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovadas' },
  { id: 'rejected', label: 'Recusadas' },
];

export interface WeatherReading {
  probability: number | null;
  precipitationMm: number | null;
  fetchedAt: Date | null;
}

export interface WeatherRequest {
  id: string;
  arenaId: string;
  bookingId: string;
  athleteId: string | null;
  athleteName: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  paidReais: number;
  note: string | null;
  status: WeatherRequestStatus;
  weather: WeatherReading | null;
  autoApproved: boolean;
  createdAt: Date | null;
  decidedAt: Date | null;
  rejectReason: string | null;
}

export function weatherRequestFromDoc(id: string, data: Record<string, unknown>): WeatherRequest {
  const w = data['weather'];
  const weather: WeatherReading | null =
    w != null && typeof w === 'object'
      ? {
          probability: num(asRecord(w)['probability']),
          precipitationMm: num(asRecord(w)['precipitationMm']),
          fetchedAt: toDateValue(asRecord(w)['fetchedAt']),
        }
      : null;
  return {
    id,
    arenaId: str(data['arenaId']) ?? '',
    bookingId: str(data['bookingId']) ?? id,
    athleteId: str(data['athleteId']),
    athleteName: str(data['athleteName']) ?? 'Atleta',
    courtId: str(data['courtId']) ?? '',
    courtName: str(data['courtName']) ?? 'Quadra',
    date: str(data['date']) ?? '',
    startTime: str(data['startTime']) ?? '',
    endTime: str(data['endTime']) ?? '',
    paidReais: num(data['paidReais']) ?? 0,
    note: str(data['note']),
    status: pick(WEATHER_REQUEST_STATUSES, data['status'], 'pending'),
    weather,
    autoApproved: data['autoApproved'] === true,
    createdAt: toDateValue(data['createdAt']),
    decidedAt: toDateValue(data['decidedAt']),
    rejectReason: str(data['rejectReason']),
  };
}

/** Pedido retirado pelo atleta não aparece em aba nenhuma. */
export function weatherRequestsForTab(list: readonly WeatherRequest[], tab: WeatherRequestTab): WeatherRequest[] {
  return list.filter((r) => r.status === tab);
}

export function weatherRequestTabCounts(list: readonly WeatherRequest[]): Record<WeatherRequestTab, number> {
  const counts: Record<WeatherRequestTab, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const r of list) {
    if (r.status !== 'withdrawn') counts[r.status] += 1;
  }
  return counts;
}

export function hasRecordedRain(r: Pick<WeatherRequest, 'weather'>): boolean {
  return (r.weather?.precipitationMm ?? 0) >= RAIN_MM_THRESHOLD;
}

/** Alvo do "Aprovar todas com chuva registrada". */
export function pendingWithRecordedRain(list: readonly WeatherRequest[]): WeatherRequest[] {
  return list.filter((r) => r.status === 'pending' && hasRecordedRain(r));
}

export const WEATHER_REQUEST_STATUS_PILL: Record<WeatherRequestStatus, { tone: PillTone; label: string }> = {
  pending: { tone: 'yellow', label: 'Pendente' },
  approved: { tone: 'green', label: 'Aprovada' },
  rejected: { tone: 'red', label: 'Recusada' },
  withdrawn: { tone: 'dim', label: 'Retirada' },
};

// ── Créditos (`arenaWeatherCredits`) ────────────────────────────────────────

export const WEATHER_CREDIT_STATUSES = ['open', 'used', 'expired'] as const;
export type WeatherCreditStatus = (typeof WEATHER_CREDIT_STATUSES)[number];

export const WEATHER_CREDIT_SOURCES = ['choice', 'auto', 'mid_game', 'reschedule'] as const;
export type WeatherCreditSource = (typeof WEATHER_CREDIT_SOURCES)[number];

export interface WeatherCreditUse {
  bookingId: string;
  amountReais: number;
  at: Date | null;
  kind: 'booking' | 'reschedule';
}

export interface WeatherCredit {
  id: string;
  arenaId: string;
  athleteId: string | null;
  athleteName: string;
  originBookingId: string;
  originCourtName: string;
  originDate: string;
  originStartTime: string;
  amountReais: number;
  balanceReais: number;
  status: WeatherCreditStatus;
  source: WeatherCreditSource;
  expiresAt: Date | null;
  createdAt: Date | null;
  uses: WeatherCreditUse[];
}

export function weatherCreditFromDoc(id: string, data: Record<string, unknown>): WeatherCredit {
  const uses = (Array.isArray(data['uses']) ? data['uses'] : []).map((raw): WeatherCreditUse => {
    const u = asRecord(raw);
    return {
      bookingId: str(u['bookingId']) ?? '',
      amountReais: num(u['amountReais']) ?? 0,
      at: toDateValue(u['at']),
      kind: u['kind'] === 'reschedule' ? 'reschedule' : 'booking',
    };
  });
  const amount = num(data['amountReais']) ?? 0;
  return {
    id,
    arenaId: str(data['arenaId']) ?? '',
    athleteId: str(data['athleteId']),
    athleteName: str(data['athleteName']) ?? 'Atleta',
    originBookingId: str(data['originBookingId']) ?? '',
    originCourtName: str(data['originCourtName']) ?? 'Quadra',
    originDate: str(data['originDate']) ?? '',
    originStartTime: str(data['originStartTime']) ?? '',
    amountReais: amount,
    balanceReais: num(data['balanceReais']) ?? amount,
    status: pick(WEATHER_CREDIT_STATUSES, data['status'], 'open'),
    source: pick(WEATHER_CREDIT_SOURCES, data['source'], 'choice'),
    expiresAt: toDateValue(data['expiresAt']),
    createdAt: toDateValue(data['createdAt']),
    uses,
  };
}

const DAY_MS = 86_400_000;

/** Dias inteiros até vencer (arredondado pra cima); `null` sem validade. */
export function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/** Crédito com saldo pra usar. */
export function isCreditOpen(c: WeatherCredit): boolean {
  return c.status === 'open' && c.balanceReais > 0;
}

export function isCreditExpiringWithin(c: WeatherCredit, days: number, now: Date): boolean {
  const left = daysUntil(c.expiresAt, now);
  return isCreditOpen(c) && left != null && left <= days;
}

export interface CreditPill {
  tone: PillTone;
  label: string;
}

/** Pill do extrato. Em aberto, "vence em ≤ 7 dias" tem prioridade sobre "parcial". */
export function weatherCreditPill(c: WeatherCredit, now: Date): CreditPill {
  if (c.status === 'expired') return { tone: 'red', label: 'Expirou' };
  if (c.status === 'used' || c.balanceReais <= 0) return { tone: 'dim', label: 'Usado' };
  const left = daysUntil(c.expiresAt, now);
  if (left != null && left <= 7) {
    if (left <= 0) return { tone: 'yellow', label: 'Vence hoje' };
    return { tone: 'yellow', label: left === 1 ? 'Vence em 1 dia' : `Vence em ${left} dias` };
  }
  if (c.balanceReais < c.amountReais) return { tone: 'orange', label: 'Parcial' };
  return { tone: 'green', label: 'Em aberto' };
}

/** Saldo exibido: expirado mostra zero (o resto virou receita da arena). */
export function creditBalanceShown(c: WeatherCredit): number {
  return c.status === 'expired' ? 0 : c.balanceReais;
}

export function creditIsFaded(c: WeatherCredit): boolean {
  return c.status === 'used' || c.status === 'expired' || c.balanceReais <= 0;
}

export function creditOriginLabel(c: WeatherCredit): string {
  return `${shortCourtName(c.originCourtName)} · ${dayMonthLabel(c.originDate)} · ${c.originStartTime}`;
}

export function creditValidityText(c: WeatherCredit): string {
  if (c.status === 'used') return '—';
  return c.expiresAt ? fullDateLabel(c.expiresAt) : 'Sem validade';
}

export interface WeatherCreditKpis {
  openBalanceReais: number;
  openAthletes: number;
  usedThisMonthReais: number;
  usedThisMonthBookings: number;
  reschedulesThisMonth: number;
  expiringIn30Reais: number;
  expiringIn30Athletes: number;
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function athleteKey(c: WeatherCredit): string {
  return c.athleteId ?? `name:${c.athleteName}`;
}

export function weatherCreditKpis(credits: readonly WeatherCredit[], now: Date): WeatherCreditKpis {
  let openBalance = 0;
  const openAthletes = new Set<string>();
  let used = 0;
  const usedBookings = new Set<string>();
  let reschedules = 0;
  let expiring = 0;
  const expiringAthletes = new Set<string>();

  for (const c of credits) {
    if (isCreditOpen(c)) {
      openBalance += c.balanceReais;
      openAthletes.add(athleteKey(c));
      if (isCreditExpiringWithin(c, 30, now)) {
        expiring += c.balanceReais;
        expiringAthletes.add(athleteKey(c));
      }
    }
    for (const u of c.uses) {
      if (u.at && sameMonth(u.at, now)) {
        used += u.amountReais;
        usedBookings.add(u.bookingId || `${c.id}:${u.at.getTime()}`);
      }
    }
    if (c.source === 'reschedule' && c.createdAt && sameMonth(c.createdAt, now)) reschedules += 1;
  }

  return {
    openBalanceReais: round2(openBalance),
    openAthletes: openAthletes.size,
    usedThisMonthReais: round2(used),
    usedThisMonthBookings: usedBookings.size,
    reschedulesThisMonth: reschedules,
    expiringIn30Reais: round2(expiring),
    expiringIn30Athletes: expiringAthletes.size,
  };
}

export type WeatherCreditFilter = 'all' | 'open' | 'expiring';
export const WEATHER_CREDIT_FILTERS: ReadonlyArray<{ id: WeatherCreditFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Em aberto' },
  { id: 'expiring', label: 'Vencendo' },
];

/** "Vencendo" = mesma janela do KPI "Vencem em 30 dias". */
export function filterWeatherCredits(
  credits: readonly WeatherCredit[],
  filter: WeatherCreditFilter,
  now: Date,
): WeatherCredit[] {
  switch (filter) {
    case 'all':
      return [...credits];
    case 'open':
      return credits.filter(isCreditOpen);
    case 'expiring':
      return credits.filter((c) => isCreditExpiringWithin(c, 30, now));
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────────

type CsvCell = string | number | null | undefined;

function csvCell(v: CsvCell): string {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `;` + BOM: é o que o Excel em pt-BR abre direto (vírgula é separador decimal aqui). */
export function toCsv(rows: CsvCell[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

function csvMoney(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Extrato de créditos, mesmas colunas da tabela. */
export function weatherCreditsCsv(credits: readonly WeatherCredit[], now: Date): string {
  const rows: CsvCell[][] = [['Atleta', 'Reserva de origem', 'Crédito (R$)', 'Saldo (R$)', 'Validade', 'Status']];
  for (const c of credits) {
    rows.push([
      c.athleteName,
      creditOriginLabel(c),
      csvMoney(c.amountReais),
      csvMoney(creditBalanceShown(c)),
      creditValidityText(c),
      weatherCreditPill(c, now).label,
    ]);
  }
  return toCsv(rows);
}

// ── Erros de callable ───────────────────────────────────────────────────────

function normalizeCode(code: string): string {
  return code.replace(/^functions\//, '').replace(/[^a-z]/gi, '').toLowerCase();
}

/** Mensagem para a tela. Copy do servidor (português) passa direto; mensagem crua do SDK
 *  ("not-found", "NOT_FOUND", "internal") vira texto de gente. `not-found` cru é a callable que
 *  ainda não foi publicada no projeto. */
export function weatherErrorMessage(err: unknown, fallback: string): string {
  const e = asRecord(err);
  const code = typeof e['code'] === 'string' ? normalizeCode(e['code']) : '';
  const message = typeof e['message'] === 'string' ? e['message'].trim() : '';
  const raw = message === '' || (code !== '' && normalizeCode(message) === code);
  if (!raw) return message;
  switch (code) {
    case 'notfound':
      return 'Recurso ainda não publicado no servidor.';
    case 'permissiondenied':
      return 'Seu cargo não tem permissão para isso.';
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo.';
    case 'unavailable':
    case 'deadlineexceeded':
      return 'O servidor não respondeu. Tente de novo em instantes.';
    case 'internal':
      return 'Não foi possível concluir no servidor. Se o recurso é novo, ele pode ainda não ter sido publicado.';
    default:
      return fallback;
  }
}

/** Erro de leitura ao vivo (onSnapshot). */
export function weatherSnapshotErrorMessage(err: unknown): string {
  const code = normalizeCode(String(asRecord(err)['code'] ?? ''));
  if (code === 'permissiondenied') return 'Seu cargo não tem acesso a estes dados.';
  if (code === 'failedprecondition') return 'A consulta ainda não está pronta no servidor (índice em criação). Tente de novo mais tarde.';
  return 'Não foi possível carregar os dados agora.';
}
