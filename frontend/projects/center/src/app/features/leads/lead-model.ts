/**
 * Captação (canvas C1–C5): interessados em `trainingCenters/{c}/leads` — gente que ainda pode não
 * ter conta NexaGO. A equipe que matricula cria e move o funil direto (rules); a experimental, a
 * avaliação do professor e a contagem por pessoa são do servidor (`training-center-leads.ts`).
 */
import { addDays, monthKey, wallClock, weekdayOf, WEEKDAY_SHORT } from '../../domain/dates';
import type { ClassSession, Program, TrainingClass } from '../../domain/models';
import { date, num, str } from '../../data/mappers';

type Data = Record<string, unknown>;

export type LeadStage = 'new' | 'contacted' | 'scheduled' | 'attended' | 'won' | 'lost';
export type LeadSource = 'instagram' | 'referral' | 'page' | 'desk' | 'whatsapp' | 'google' | 'app' | 'other';
export type LeadExperience = 'never' | 'plays' | 'competes' | '';
export type LeadPeriod = 'morning' | 'afternoon' | 'night' | '';
export type LostReason = 'price' | 'schedule' | 'no_response' | 'other';
export type TrialLevel = 'beginner' | 'intermediate' | 'advanced' | '';
export type LeadHistoryKind = 'created' | 'contact' | 'note' | 'stage' | 'trial' | 'feedback' | 'won' | 'lost';

export interface LeadInterest {
  programId: string;
  programName: string;
  experience: LeadExperience;
  period: LeadPeriod;
  goal: string;
}

export interface LeadTrial {
  bookingId: string;
  sessionId: string;
  classId: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  coachName: string;
  locationName: string;
  status: 'pending' | 'confirmed' | 'declined' | 'canceled';
  attendance: 'attended' | 'no_show' | null;
}

export interface LeadFeedback {
  level: TrialLevel;
  classId: string;
  className: string;
  note: string;
  byName: string;
  at: Date | null;
}

export interface LeadHistoryItem {
  at: Date | null;
  byName: string;
  kind: LeadHistoryKind;
  text: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  phoneDigits: string;
  email: string;
  age: number | null;
  source: LeadSource;
  referredBy: string;
  interest: LeadInterest;
  stage: LeadStage;
  lostReason: LostReason | null;
  ownerUid: string | null;
  ownerName: string;
  athleteId: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  proposalUntil: string | null;
  trial: LeadTrial | null;
  coachFeedback: LeadFeedback | null;
  trialsCount: number;
  history: LeadHistoryItem[];
  createdAt: Date | null;
  updatedAt: Date | null;
  firstContactAt: Date | null;
  createdByName: string;
}

export interface LeadSettings {
  maxTrialsPerPerson: number;
  maxTrialsPerSession: number;
  onlyWithSpots: boolean;
  coachReview: 'required' | 'optional';
  offerDays: number;
  publicPage: boolean;
  assignMode: 'staff' | 'rotation';
  alertHours: number;
}

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  maxTrialsPerPerson: 1,
  maxTrialsPerSession: 2,
  onlyWithSpots: true,
  coachReview: 'required',
  offerDays: 7,
  publicPage: false,
  assignMode: 'staff',
  alertHours: 2,
};

/** Colunas do funil (C1). Perdidos ficam no rodapé. */
export const FUNNEL: { stage: LeadStage; label: string; color: string }[] = [
  { stage: 'new', label: 'Novos', color: '#9AA0A6' },
  { stage: 'contacted', label: 'Em contato', color: '#5B9BFF' },
  { stage: 'scheduled', label: 'Experimental agendada', color: '#F4C543' },
  { stage: 'attended', label: 'Fez experimental', color: '#FF8A4A' },
  { stage: 'won', label: 'Matriculados', color: '#2BD17E' },
];

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: 'Novo',
  contacted: 'Em contato',
  scheduled: 'Experimental agendada',
  attended: 'Fez experimental',
  won: 'Matriculado',
  lost: 'Perdido',
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  instagram: 'Instagram',
  referral: 'Indicação',
  page: 'Página do CT',
  desk: 'Balcão',
  whatsapp: 'WhatsApp',
  google: 'Google',
  app: 'App NexaGO',
  other: 'Outro',
};

/** Origens que a equipe escolhe no cadastro (página e app entram sozinhos). */
export const MANUAL_SOURCES: LeadSource[] = ['desk', 'instagram', 'whatsapp', 'referral', 'google', 'other'];

export const EXPERIENCE_LABEL: Record<Exclude<LeadExperience, ''>, string> = {
  never: 'Nunca jogou',
  plays: 'Já joga',
  competes: 'Compete',
};

export const PERIOD_LABEL: Record<Exclude<LeadPeriod, ''>, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  night: 'Noite',
};

export const LEVEL_LABEL: Record<Exclude<TrialLevel, ''>, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

export const LOST_LABEL: Record<LostReason, string> = {
  price: 'Preço',
  schedule: 'Horário',
  no_response: 'Sem resposta',
  other: 'Outro',
};

const SOURCES = Object.keys(SOURCE_LABEL) as LeadSource[];
const STAGES = Object.keys(STAGE_LABEL) as LeadStage[];

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function objOf(d: Data, k: string): Data | null {
  const v = d[k];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Data) : null;
}

/** Só dígitos, sem o DDI 55 (mesma chave do servidor para achar a pessoa pelo telefone). */
export function phoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
}

export function isValidPhone(phone: string): boolean {
  return /^[1-9][0-9]9?[0-9]{8}$/.test(phoneDigits(phone));
}

export function readLead(id: string, d: Data): Lead {
  const interest = objOf(d, 'interest') ?? {};
  const t = objOf(d, 'trial');
  const f = objOf(d, 'coachFeedback');
  const history = Array.isArray(d['history']) ? (d['history'] as unknown[]) : [];
  const age = d['age'];
  return {
    id,
    name: str(d, 'name') || 'Interessado',
    phone: str(d, 'phone'),
    phoneDigits: str(d, 'phoneDigits'),
    email: str(d, 'email'),
    age: typeof age === 'number' && age > 0 ? age : null,
    source: oneOf(d['source'], SOURCES, 'other'),
    referredBy: str(d, 'referredBy'),
    interest: {
      programId: str(interest, 'programId'),
      programName: str(interest, 'programName'),
      experience: oneOf(interest['experience'], ['never', 'plays', 'competes', ''] as const, ''),
      period: oneOf(interest['period'], ['morning', 'afternoon', 'night', ''] as const, ''),
      goal: str(interest, 'goal'),
    },
    stage: oneOf(d['stage'], STAGES, 'new'),
    lostReason: d['lostReason'] ? oneOf(d['lostReason'], ['price', 'schedule', 'no_response', 'other'] as const, 'other') : null,
    ownerUid: str(d, 'ownerUid') || null,
    ownerName: str(d, 'ownerName'),
    athleteId: str(d, 'athleteId') || null,
    studentId: str(d, 'studentId') || null,
    enrollmentId: str(d, 'enrollmentId') || null,
    proposalUntil: str(d, 'proposalUntil') || null,
    trial: t
      ? {
          bookingId: str(t, 'bookingId'),
          sessionId: str(t, 'sessionId'),
          classId: str(t, 'classId'),
          className: str(t, 'className') || 'Turma',
          date: str(t, 'date'),
          startTime: str(t, 'startTime'),
          endTime: str(t, 'endTime'),
          coachName: str(t, 'coachName'),
          locationName: str(t, 'locationName'),
          status: oneOf(t['status'], ['pending', 'confirmed', 'declined', 'canceled'] as const, 'confirmed'),
          attendance: t['attendance'] === 'attended' || t['attendance'] === 'no_show' ? t['attendance'] : null,
        }
      : null,
    coachFeedback: f
      ? {
          level: oneOf(f['level'], ['beginner', 'intermediate', 'advanced', ''] as const, ''),
          classId: str(f, 'classId'),
          className: str(f, 'className'),
          note: str(f, 'note'),
          byName: str(f, 'byName'),
          at: date(f['at']),
        }
      : null,
    trialsCount: num(d, 'trialsCount'),
    history: history
      .filter((h): h is Data => !!h && typeof h === 'object')
      .map((h) => ({
        at: date(h['at']),
        byName: str(h, 'byName'),
        kind: oneOf(h['kind'], ['created', 'contact', 'note', 'stage', 'trial', 'feedback', 'won', 'lost'] as const, 'note'),
        text: str(h, 'text'),
      })),
    createdAt: date(d['createdAt']),
    updatedAt: date(d['updatedAt']),
    firstContactAt: date(d['firstContactAt']),
    createdByName: str(d, 'createdByName'),
  };
}

function intIn(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

export function readLeadSettings(d: Data | null | undefined): LeadSettings {
  const x = d ?? {};
  const D = DEFAULT_LEAD_SETTINGS;
  return {
    maxTrialsPerPerson: intIn(x['maxTrialsPerPerson'], D.maxTrialsPerPerson, 0, 10),
    maxTrialsPerSession: intIn(x['maxTrialsPerSession'], D.maxTrialsPerSession, 1, 10),
    onlyWithSpots: typeof x['onlyWithSpots'] === 'boolean' ? x['onlyWithSpots'] : D.onlyWithSpots,
    coachReview: x['coachReview'] === 'optional' ? 'optional' : 'required',
    offerDays: intIn(x['offerDays'], D.offerDays, 0, 60),
    publicPage: x['publicPage'] === true,
    assignMode: x['assignMode'] === 'rotation' ? 'rotation' : 'staff',
    alertHours: intIn(x['alertHours'], D.alertHours, 1, 168),
  };
}

// ── funil ───────────────────────────────────────────────────────────────

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "há 18 min", "há 2h", "ontem", "3 dias". */
export function ago(at: Date | null, now = new Date()): string {
  if (!at) return '';
  const min = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (min < 60) return `há ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `${d} dias`;
}

/** "Hoje 07:00", "Qui 07:00", "29/10 07:00". */
export function trialWhenShort(t: Pick<LeadTrial, 'date' | 'startTime'>, todayKey: string): string {
  if (t.date === todayKey) return `Hoje ${t.startTime}`;
  if (t.date === addDays(todayKey, 1)) return `Amanhã ${t.startTime}`;
  const wd = WEEKDAY_SHORT[weekdayOf(t.date)];
  if (t.date > todayKey && t.date <= addDays(todayKey, 6)) return `${wd} ${t.startTime}`;
  return `${t.date.slice(8, 10)}/${t.date.slice(5, 7)} ${t.startTime}`;
}

export function interestLine(l: Lead): string {
  const exp = l.interest.experience ? EXPERIENCE_LABEL[l.interest.experience].toLowerCase() : '';
  const period = l.interest.period ? PERIOD_LABEL[l.interest.period].toLowerCase() : '';
  return [l.interest.programName || 'Modalidade a definir', exp || period].filter(Boolean).join(' · ');
}

export type LeadFlag = 'late' | 'warn' | 'hot' | null;

/** Sinal do card: novo esperando além do alerta, sem resposta há dias, avaliado (quente). */
export function leadFlag(l: Lead, alertHours: number, now = new Date()): LeadFlag {
  const updated = (l.updatedAt ?? l.createdAt)?.getTime() ?? now.getTime();
  if (l.stage === 'new' && l.createdAt && now.getTime() - l.createdAt.getTime() > alertHours * 3_600_000) return 'warn';
  if (l.stage === 'contacted' && now.getTime() - updated > 3 * 86_400_000) return 'late';
  if (l.stage === 'attended' && l.coachFeedback) return 'hot';
  return null;
}

/** Linha de apoio do card (o "próximo passo"). */
export function nextLine(l: Lead, alertHours: number, todayKey: string, now = new Date()): string {
  switch (l.stage) {
    case 'new': {
      if (!l.createdAt) return SOURCE_LABEL[l.source];
      const due = new Date(l.createdAt.getTime() + alertHours * 3_600_000);
      if (due.getTime() < now.getTime()) return `Sem resposta ${ago(l.createdAt, now)}`;
      return `Responder até ${wallClock(due).time}`;
    }
    case 'contacted': {
      const last = l.history[l.history.length - 1];
      const flag = leadFlag(l, alertHours, now);
      if (flag === 'late') return `Sem resposta há ${Math.round((now.getTime() - (l.updatedAt?.getTime() ?? now.getTime())) / 86_400_000)} dias`;
      return last && (last.kind === 'contact' || last.kind === 'note') ? last.text.replace(/^Contato · /, '') : 'Aguardando resposta';
    }
    case 'scheduled':
      return l.trial ? `${l.trial.coachName ? 'Prof. ' + firstName(l.trial.coachName) : l.trial.className}` : 'Experimental agendada';
    case 'attended':
      if (l.coachFeedback) {
        const lvl = l.coachFeedback.level ? LEVEL_LABEL[l.coachFeedback.level].toLowerCase() : 'avaliado';
        return `${firstName(l.coachFeedback.byName || 'Professor')}: “nível ${lvl}”`;
      }
      return l.trial?.attendance === 'attended' ? 'Aguardando avaliação' : 'Fez experimental';
    case 'won':
      return l.enrollmentId ? 'Matrícula criada' : 'Matriculado';
    case 'lost':
      return l.lostReason ? LOST_LABEL[l.lostReason] : 'Perdido';
  }
}

/** Quando do card: a experimental para quem tem uma; senão há quanto tempo entrou. */
export function whenLabel(l: Lead, todayKey: string, now = new Date()): string {
  if ((l.stage === 'scheduled' || l.stage === 'attended') && l.trial) {
    if (l.stage === 'scheduled') return trialWhenShort(l.trial, todayKey);
    return ago(l.updatedAt, now);
  }
  if (l.stage === 'won') return l.updatedAt ? `${String(l.updatedAt.getDate()).padStart(2, '0')}/${String(l.updatedAt.getMonth() + 1).padStart(2, '0')}` : '';
  return ago(l.stage === 'new' ? l.createdAt : (l.updatedAt ?? l.createdAt), now);
}

/** Filtro por modalidade (programa); '' = todas. */
export function filterLeads(list: Lead[], programId: string): Lead[] {
  return programId ? list.filter((l) => l.interest.programId === programId) : list;
}

export function byStage(list: Lead[], stage: LeadStage): Lead[] {
  const items = list.filter((l) => l.stage === stage);
  // Novos: os mais antigos primeiro (fila de resposta). Agendados: pela data da aula. Resto: recentes.
  if (stage === 'new') return items.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  if (stage === 'scheduled') {
    return items.sort((a, b) => `${a.trial?.date}${a.trial?.startTime}`.localeCompare(`${b.trial?.date}${b.trial?.startTime}`));
  }
  return items.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

export interface FunnelStats {
  newThisMonth: number;
  newPrevMonth: number;
  attendedThisMonth: number;
  wonThisMonth: number;
  noReply: number;
  avgResponseMin: number | null;
}

function inMonth(at: Date | null, month: string, tz?: string): boolean {
  return !!at && monthKey(wallClock(at, tz).dayKey) === month;
}

/**
 * Números do topo, no mês corrente: interessados que entraram, quem fez experimental (pela data
 * da aula) e quem matriculou (pela última mudança). Sem resposta = novo há mais de 24h.
 */
export function funnelStats(list: Lead[], todayKey: string, now = new Date(), tz?: string): FunnelStats {
  const month = monthKey(todayKey);
  const prev = monthKey(addDays(`${month}-01`, -1));
  const responses = list
    .filter((l) => l.createdAt && l.firstContactAt && inMonth(l.createdAt, month, tz))
    .map((l) => (l.firstContactAt!.getTime() - l.createdAt!.getTime()) / 60_000)
    .filter((m) => m >= 0);
  return {
    newThisMonth: list.filter((l) => inMonth(l.createdAt, month, tz)).length,
    newPrevMonth: list.filter((l) => inMonth(l.createdAt, prev, tz)).length,
    attendedThisMonth: list.filter((l) => l.trial?.attendance === 'attended' && monthKey(l.trial.date) === month).length,
    wonThisMonth: list.filter((l) => l.stage === 'won' && inMonth(l.updatedAt, month, tz)).length,
    noReply: list.filter((l) => l.stage === 'new' && l.createdAt && now.getTime() - l.createdAt.getTime() > 86_400_000).length,
    avgResponseMin: responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length) : null,
  };
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** "3h10", "45 min". */
export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function lostSummary(list: Lead[]): { total: number; reasons: { reason: LostReason; count: number }[] } {
  const lost = list.filter((l) => l.stage === 'lost');
  const counts = new Map<LostReason, number>();
  for (const l of lost) counts.set(l.lostReason ?? 'other', (counts.get(l.lostReason ?? 'other') ?? 0) + 1);
  return {
    total: lost.length,
    reasons: [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/** Link do WhatsApp (DDI 55 quando vier sem). */
export function whatsAppLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

// ── C2 · horários para a experimental ───────────────────────────────────

export interface TrialSlot {
  sessionId: string;
  classId: string;
  className: string;
  programId: string;
  level: string;
  coachName: string;
  locationName: string;
  date: string;
  startTime: string;
  spotsLeft: number;
  trials: number;
  /** Motivo de não aceitar mais experimental (null = pode agendar). */
  blocked: string | null;
  period: Exclude<LeadPeriod, ''>;
}

export function periodOf(time: string): Exclude<LeadPeriod, ''> {
  const h = Number(time.slice(0, 2));
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'night';
}

/**
 * Aulas dos próximos `days` dias que podem receber a experimental (turma ativa, aula agendada e
 * ainda por começar), com vagas e quantas experimentais já tem — mesma conta do servidor
 * (capacidade − fixos − reposições − experimentais).
 */
export function trialSlots(
  sessions: ClassSession[],
  classes: TrainingClass[],
  cfg: LeadSettings,
  todayKey: string,
  nowTime: string,
  days = 14,
): TrialSlot[] {
  const until = addDays(todayKey, days);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const out: TrialSlot[] = [];
  for (const s of sessions) {
    const cls = byId.get(s.classId);
    if (!cls || cls.status !== 'active' || s.status !== 'scheduled') continue;
    if (s.date < todayKey || s.date > until || (s.date === todayKey && s.startTime <= nowTime)) continue;
    const trials = s.trials.length;
    const spotsLeft = Math.max(0, cls.capacity - cls.rosterStudentIds.length - s.makeupStudentIds.length - trials);
    const blocked =
      trials >= cfg.maxTrialsPerSession
        ? 'Limite de experimentais atingido'
        : cfg.onlyWithSpots && spotsLeft === 0
          ? 'Turma sem vaga'
          : null;
    out.push({
      sessionId: s.id,
      classId: s.classId,
      className: s.className || cls.name,
      programId: s.programId || cls.programId,
      level: cls.level,
      coachName: s.coachName || cls.coachName,
      locationName: s.locationName || cls.locationName,
      date: s.date,
      startTime: s.startTime,
      spotsLeft,
      trials,
      blocked,
      period: periodOf(s.startTime),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className));
}

/** "1 vaga · 0 experimentais". */
export function slotLabel(s: TrialSlot): string {
  if (s.blocked) return s.blocked;
  const v = `${s.spotsLeft} ${s.spotsLeft === 1 ? 'vaga' : 'vagas'}`;
  return `${v} · ${s.trials} ${s.trials === 1 ? 'experimental' : 'experimentais'}`;
}

/** "Ter 27". */
export function dayShort(dateKey: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(dateKey)]} ${dateKey.slice(8, 10)}`;
}

/** Programas que têm aula no funil/slots, para os chips de filtro. */
export function programChips(programs: Program[]): { id: string; name: string }[] {
  return programs.map((p) => ({ id: p.id, name: p.name }));
}
