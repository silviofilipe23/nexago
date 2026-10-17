/**
 * Candidaturas e convites do NexaSquad (tela 04 · Candidaturas & convites).
 *
 * `squadApplications` vira os cards do kanban (Novas · Em análise · Convidados · Contrato enviado);
 * `squadInvites` dá a nota automática ("Convite enviado há 3 dias…") e os fatos do contrato enviado.
 * Fato sem fonte mostra "—", nunca número inventado.
 */
import { dateOf } from '../../comissoes/data/commission';
import { TIER_LABELS, type SquadTier } from '../../niveis-regras/data/squad-rules';
import {
  DAY_MS,
  STAGES,
  inviteNote,
  isHotCandidate,
  type ArchivedReason,
  type InviteStatus,
  type LeadsGroup,
  type Stage,
} from '../../data/squad-program';

export type Column = (typeof STAGES)[number];

export const COLUMN_LABELS: Record<Column, string> = {
  new: 'Novas',
  review: 'Em análise',
  invited: 'Convidados',
  contract: 'Contrato enviado',
};

export const ARCHIVED_LABELS: Record<ArchivedReason, string> = {
  rejected: 'Recusada',
  waitlist: 'Lista de espera',
  expired: 'Expirado',
  canceled: 'Cancelado',
  accepted: 'Assinado',
};

export const LEADS_LABELS: Record<LeadsGroup, string> = {
  no: 'Não lidera turma',
  lt10: 'Menos de 10 atletas',
  '10to30': '10 a 30 atletas',
  gt30: 'Mais de 30 atletas',
};

/** Forma curta para o mini-fato do card (cabe em meia coluna). */
const LEADS_SHORT: Record<LeadsGroup, string> = { no: 'Não lidera', lt10: '< 10 atl.', '10to30': '10–30 atl.', gt30: '> 30 atl.' };

export const SOURCE_LABELS = { portal: 'Portal', app: 'App', manual: 'Convite direto' } as const;
export type Source = keyof typeof SOURCE_LABELS;

export interface Note {
  by: string;
  at: Date | null;
  text: string;
}

export interface Snapshot {
  city: string | null;
  state: string | null;
  arenaName: string | null;
  tournaments: number | null;
  elo: string | null;
  rankingPosition: number | null;
  referredCount: number | null;
  conductIncidents: number | null;
  memberSince: Date | null;
}

export interface Application {
  id: string;
  athleteId: string;
  name: string;
  source: Source;
  submittedAt: Date | null;
  answers: { instagram: string | null; city: string; leadsGroup: LeadsGroup | null; why: string } | null;
  social: { followers: number | null; engagementPct: number | null; checkedAt: Date | null; checkedBy: string | null } | null;
  snapshot: Snapshot;
  suggestedTier: SquadTier;
  suggestedAuto: boolean;
  stage: Stage;
  archivedReason: ArchivedReason | null;
  internalReason: string | null;
  notes: Note[];
  inviteId: string | null;
  stageChangedAt: Date | null;
}

export interface Invite {
  id: string;
  applicationId: string | null;
  tier: SquadTier;
  commissionPct: number | null;
  suggestedCode: string;
  periodStart: string | null;
  periodEnd: string | null;
  message: string | null;
  scheduledFor: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  expiresAt: Date | null;
  status: InviteStatus;
  reminders: string[];
}

type Raw = Record<string, unknown>;

const TIERS: readonly SquadTier[] = ['ath', 'amb', 'pro', 'cap'];
const LEADS: readonly LeadsGroup[] = ['no', 'lt10', '10to30', 'gt30'];
const ARCHIVED: readonly ArchivedReason[] = ['rejected', 'waitlist', 'expired', 'canceled', 'accepted'];
const INVITE_STATUSES: readonly InviteStatus[] = ['scheduled', 'sent', 'opened', 'accepted', 'expired', 'canceled'];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);
const actorName = (v: unknown) => str(obj(v)?.['name']) || null;

export function applicationFromDoc(id: string, d: Raw): Application {
  const snap = obj(d['snapshot']) ?? {};
  const answers = obj(d['answers']);
  const social = obj(d['social']);
  const stage = str(d['stage']);
  return {
    id,
    athleteId: str(d['athleteId']),
    name: str(d['athleteName']) || str(snap['name']) || 'Atleta',
    source: (['portal', 'app', 'manual'].includes(str(d['source'])) ? str(d['source']) : 'app') as Source,
    submittedAt: dateOf(d['submittedAt']),
    answers: answers
      ? {
          instagram: str(answers['instagram']).trim().replace(/^@+/, '') || null,
          city: str(answers['city']),
          leadsGroup: LEADS.includes(answers['leadsGroup'] as LeadsGroup) ? (answers['leadsGroup'] as LeadsGroup) : null,
          why: str(answers['why']),
        }
      : null,
    social: social
      ? {
          followers: numOrNull(social['followers']),
          engagementPct: numOrNull(social['engagementPct']),
          checkedAt: dateOf(social['checkedAt']),
          checkedBy: actorName(social['checkedBy']),
        }
      : null,
    snapshot: {
      city: str(snap['city']) || null,
      state: str(snap['state']) || null,
      arenaName: str(snap['arenaName']) || null,
      tournaments: numOrNull(snap['tournaments']),
      elo: str(snap['elo']) || null,
      rankingPosition: numOrNull(snap['rankingPosition']),
      referredCount: numOrNull(snap['referredCount']),
      conductIncidents: numOrNull(snap['conductIncidents']),
      memberSince: dateOf(snap['memberSince']),
    },
    suggestedTier: TIERS.includes(d['suggestedTier'] as SquadTier) ? (d['suggestedTier'] as SquadTier) : 'ath',
    suggestedAuto: d['suggestedBy'] === 'auto' || d['suggestedBy'] == null,
    stage: ([...STAGES, 'archived'] as string[]).includes(stage) ? (stage as Stage) : 'new',
    archivedReason: ARCHIVED.includes(d['archivedReason'] as ArchivedReason) ? (d['archivedReason'] as ArchivedReason) : null,
    internalReason: str(d['internalReason']) || null,
    notes: (Array.isArray(d['notes']) ? (d['notes'] as Raw[]) : []).map((n) => ({
      by: actorName(n['by']) ?? '—',
      at: dateOf(n['at']),
      text: str(n['text']),
    })),
    inviteId: str(d['inviteId']) || null,
    stageChangedAt: dateOf(d['stageChangedAt']),
  };
}

export function inviteFromDoc(id: string, d: Raw): Invite {
  return {
    id,
    applicationId: str(d['applicationId']) || null,
    tier: TIERS.includes(d['tier'] as SquadTier) ? (d['tier'] as SquadTier) : 'ath',
    commissionPct: numOrNull(d['commissionPct']),
    suggestedCode: str(d['suggestedCode']),
    periodStart: str(d['periodStart']) || null,
    periodEnd: str(d['periodEnd']) || null,
    message: str(d['message']) || null,
    scheduledFor: str(d['scheduledFor']) || null,
    sentAt: dateOf(d['sentAt']),
    openedAt: dateOf(d['openedAt']),
    expiresAt: dateOf(d['expiresAt']),
    status: INVITE_STATUSES.includes(d['status'] as InviteStatus) ? (d['status'] as InviteStatus) : 'sent',
    reminders: Array.isArray(d['reminders']) ? (d['reminders'] as unknown[]).map(String) : [],
  };
}

// ── formatação ──────────────────────────────────────────────────────────────

/** "61 mil", "8,5 mil", "950". */
export function compactCount(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000) {
    const k = n / 1000;
    return `${k.toLocaleString('pt-BR', { maximumFractionDigits: k < 10 ? 1 : 0 })} mil`;
  }
  return n.toLocaleString('pt-BR');
}

export function placeOf(app: Application): string {
  const city = app.snapshot.city ?? app.answers?.city ?? null;
  return [city, app.snapshot.arenaName].filter(Boolean).join(' · ') || '—';
}

export interface Fact {
  label: string;
  value: string;
}

/**
 * Os 2 mini-fatos do card, pela sugestão (spec). No Contrato enviado mostra o que o atleta está
 * assinando: período e comissão.
 */
export function cardFacts(app: Application, invite: Invite | null, defaultPct: number | null): Fact[] {
  const s = app.snapshot;
  const tournaments = { label: 'Torneios', value: s.tournaments === null ? '—' : String(s.tournaments) };
  const followers = { label: 'Seguidores', value: compactCount(app.social?.followers ?? null) };
  if (app.stage === 'contract' && invite) {
    const days = periodDays(invite);
    const pct = invite.commissionPct ?? defaultPct;
    return [
      { label: 'Período', value: days === null ? '—' : `${days} dias` },
      { label: 'Comissão', value: pct === null ? '—' : `${pct.toLocaleString('pt-BR')}%` },
    ];
  }
  switch (app.suggestedTier) {
    case 'cap':
      return s.referredCount !== null && s.referredCount > 0
        ? [{ label: 'Indicou', value: `${s.referredCount} atletas` }, tournaments]
        : [{ label: 'Comunidade', value: app.answers?.leadsGroup ? LEADS_SHORT[app.answers.leadsGroup] : '—' }, tournaments];
    case 'pro':
      return [{ label: 'Ranking', value: s.rankingPosition === null ? '—' : `#${s.rankingPosition}` }, followers];
    case 'amb': {
      const eng = app.social?.engagementPct ?? null;
      return app.social?.followers == null && eng !== null
        ? [tournaments, { label: 'Engaj.', value: `${eng.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` }]
        : [tournaments, followers];
    }
    default:
      return [tournaments, { label: 'Elo', value: s.elo ?? '—' }];
  }
}

/** Dias do período do convite: do início (ou de hoje) até o fim. */
export function periodDays(invite: Invite, now = new Date()): number | null {
  if (!invite.periodEnd) return null;
  const start = invite.periodStart ? new Date(`${invite.periodStart}T12:00:00-03:00`) : now;
  const end = new Date(`${invite.periodEnd}T12:00:00-03:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

/** Nota do card: status automático do convite; senão a última nota do time. */
export function cardNote(app: Application, invite: Invite | null, now: Date): string | null {
  if ((app.stage === 'invited' || app.stage === 'contract') && invite) return inviteNote(invite, now);
  return app.notes.length > 0 ? app.notes[app.notes.length - 1].text : null;
}

export function isHot(app: Application): boolean {
  return isHotCandidate({ suggestedTier: app.suggestedTier, referredCount: app.snapshot.referredCount, applicationScore: null });
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

/** Busca do header: nome, @ do Instagram ou cidade. */
export function matchesApplication(app: Application, term: string): boolean {
  const q = fold(term.trim().replace(/^@/, ''));
  if (!q) return true;
  return [app.name, app.answers?.instagram ?? '', app.snapshot.city ?? '', app.answers?.city ?? ''].some((v) => fold(v).includes(q));
}

/** Trechos com o termo destacado (sem HTML cru). */
export function highlight(text: string, term: string): Array<{ text: string; hit: boolean }> {
  const q = fold(term.trim().replace(/^@/, ''));
  if (!q) return [{ text, hit: false }];
  const folded = fold(text);
  const out: Array<{ text: string; hit: boolean }> = [];
  let from = 0;
  for (let i = folded.indexOf(q); i >= 0; i = folded.indexOf(q, i + q.length)) {
    if (i > from) out.push({ text: text.slice(from, i), hit: false });
    out.push({ text: text.slice(i, i + q.length), hit: true });
    from = i + q.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out;
}

export function byColumn(apps: Application[]): Record<Column, Application[]> {
  const out: Record<Column, Application[]> = { new: [], review: [], invited: [], contract: [] };
  for (const a of apps) if (a.stage !== 'archived') out[a.stage].push(a);
  // Mais antigo primeiro: a fila anda de cima para baixo.
  for (const col of STAGES) out[col].sort((a, b) => (a.stageChangedAt?.getTime() ?? 0) - (b.stageChangedAt?.getTime() ?? 0));
  return out;
}

export function tierName(tier: SquadTier): string {
  return TIER_LABELS[tier];
}
