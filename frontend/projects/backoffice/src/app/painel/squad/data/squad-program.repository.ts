import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../data/firebase';
import { AthletesRepository } from '../../atletas/data/athletes.repository';
import { dateOf } from '../comissoes/data/commission';
import { SquadRulesRepository } from '../niveis-regras/data/squad-rules.repository';
import type { SquadRules, SquadTier } from '../niveis-regras/data/squad-rules';
import { DEFAULT_CYCLE, type Cycle, type InviteStatus } from './squad-program';

type Raw = Record<string, unknown>;

/** Contrato `squadAmbassadors/{uid}` como as telas 02/04 precisam. */
export interface Contract {
  uid: string;
  name: string;
  city: string | null;
  arenaName: string | null;
  tier: SquadTier;
  code: string;
  commissionPct: number | null;
  rulesVersion: number | null;
  state: 'active' | 'paused' | 'ended';
  start: Date | null;
  end: Date | null;
  pausedUntil: string | null;
  endsAt: string | null;
  /** Aditivo esperando o aceite do atleta. */
  pendingTier: SquadTier | null;
  /** Score diário (0–100) — `null` enquanto o recálculo não existir. */
  score: number | null;
  points: number | null;
}

/** Comissão contada na tela 02 (liberada ou paga). */
export interface CountedCommission {
  ambassadorId: string;
  netCents: number;
  amountCents: number;
  registeredAt: Date | null;
}

export interface ProgramState {
  contracts: Contract[];
  commissions: CountedCommission[];
  rules: SquadRules;
  rulesVersion: number;
  cycle: Cycle;
  /** Convites enviados/abertos: seguram vaga. */
  outstandingInvites: number;
}

export interface AthleteOption {
  uid: string;
  name: string;
  email: string | null;
}

export type ContractActionInput =
  | { action: 'changeTier'; tier: SquadTier; reason: string; commissionPct?: number | null }
  | { action: 'pause'; reason: string; until?: string | null }
  | { action: 'resume' }
  | { action: 'end'; reason: EndReason; note?: string | null; effectiveDate: string };

export const END_REASONS = [
  'low_conversion',
  'low_participation',
  'conduct',
  'brand_misuse',
  'athlete_request',
  'cycle_end',
] as const;
export type EndReason = (typeof END_REASONS)[number];

export const END_REASON_LABELS: Record<EndReason, string> = {
  low_conversion: 'Baixa conversão',
  low_participation: 'Baixa participação',
  conduct: 'Conduta',
  brand_misuse: 'Uso inadequado da marca',
  athlete_request: 'Pedido do atleta',
  cycle_end: 'Fim do ciclo',
};

export interface SendInviteInput {
  athleteId: string;
  applicationId?: string | null;
  tier: SquadTier;
  commissionPct?: number | null;
  suggestedCode: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  message?: string | null;
}

export interface SendInviteResult {
  inviteId: string;
  applicationId: string;
  status: 'sent' | 'scheduled';
  scheduledFor: string | null;
}

const TIERS: readonly SquadTier[] = ['ath', 'amb', 'pro', 'cap'];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tierOf = (v: unknown): SquadTier => (TIERS.includes(v as SquadTier) ? (v as SquadTier) : 'ath');

export function contractFromDoc(uid: string, d: Raw): Contract {
  const state = d['status'] === 'paused' ? 'paused' : d['status'] === 'ended' ? 'ended' : 'active';
  const amendments = Array.isArray(d['amendments']) ? (d['amendments'] as Raw[]) : [];
  const pending = amendments.find((a) => !a['acceptedAt'] && !a['canceledAt']);
  return {
    uid,
    name: str(d['displayName']) || uid,
    city: str(d['city']) || null,
    arenaName: str(d['arenaName']) || null,
    tier: tierOf(d['tier']),
    code: str(d['code']),
    commissionPct: numOrNull(d['commissionPct']),
    rulesVersion: numOrNull(d['rulesVersion']),
    state,
    // Contrato antigo (do script) sem `start`: a criação conta como início.
    start: dateOf(d['start']) ?? dateOf(d['createdAt']),
    end: dateOf(d['end']),
    pausedUntil: str(d['pausedUntil']) || null,
    endsAt: str(d['endsAt']) || null,
    pendingTier: pending && TIERS.includes(pending['toTier'] as SquadTier) ? (pending['toTier'] as SquadTier) : null,
    score: numOrNull(d['score']),
    points: numOrNull(d['points']),
  };
}

export function cycleFromDoc(d: Raw | undefined): Cycle {
  if (!d) return { ...DEFAULT_CYCLE };
  const date = (v: unknown, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : fallback);
  const seats = Number.isInteger(d['seats']) && (d['seats'] as number) > 0 ? (d['seats'] as number) : DEFAULT_CYCLE.seats;
  return {
    id: str(d['id']) || DEFAULT_CYCLE.id,
    start: date(d['start'], DEFAULT_CYCLE.start),
    end: date(d['end'], DEFAULT_CYCLE.end),
    seats,
  };
}

/**
 * Leitura direto do Firestore; escrita só pelas callables de `functions/src/squad-applications.ts`
 * e `squad-contracts.ts` (as rules negam escrita de cliente em contratos, candidaturas e convites).
 */
@Injectable({ providedIn: 'root' })
export class SquadProgramRepository {
  private readonly rulesRepo = inject(SquadRulesRepository);
  private readonly athletes = inject(AthletesRepository);

  async load(): Promise<ProgramState> {
    const db = backofficeDb();
    const [contracts, commissions, rules, cycle, invites] = await Promise.all([
      getDocs(collection(db, 'squadAmbassadors')),
      getDocs(query(collection(db, 'squadCommissions'), where('status', 'in', ['released', 'paid']))),
      this.rulesRepo.load(),
      this.cycle(),
      this.outstandingInvites(),
    ]);
    return {
      contracts: contracts.docs.map((d) => contractFromDoc(d.id, d.data() as Raw)),
      commissions: commissions.docs.map((d) => {
        const c = d.data() as Raw;
        return {
          ambassadorId: str(c['ambassadorId']),
          netCents: numOrNull(c['netCents']) ?? 0,
          amountCents: numOrNull(c['amountCents']) ?? 0,
          registeredAt: dateOf(c['registeredAt']),
        };
      }),
      rules: rules.rules,
      rulesVersion: rules.version,
      cycle,
      outstandingInvites: invites,
    };
  }

  async cycle(): Promise<Cycle> {
    const snap = await getDoc(doc(backofficeDb(), 'squadConfig', 'cycle'));
    return cycleFromDoc(snap.exists() ? (snap.data() as Raw) : undefined);
  }

  async outstandingInvites(): Promise<number> {
    const statuses: InviteStatus[] = ['sent', 'opened'];
    const snap = await getDocs(query(collection(backofficeDb(), 'squadInvites'), where('status', 'in', statuses)));
    return snap.size;
  }

  /** Busca de conta NexaGO para o convite direto (mesma callable da tela Atletas). */
  async searchAthletes(term: string): Promise<AthleteOption[]> {
    const page = await this.athletes.listUsers(term, null, 8);
    return page.rows.map((u) => ({ uid: u.uid, name: u.fullName ?? u.displayName ?? u.email ?? u.uid, email: u.email }));
  }

  async updateContract(uid: string, input: ContractActionInput): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'updateSquadContract')({ uid, ...input });
  }

  async sendInvite(input: SendInviteInput): Promise<SendInviteResult> {
    const r = await httpsCallable<SendInviteInput, SendInviteResult>(backofficeFunctions(), 'sendSquadInvite')(input);
    return r.data;
  }

  async updateInvite(inviteId: string, action: 'resend' | 'cancel'): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'updateSquadInvite')({ inviteId, action });
  }

  async updateApplication(applicationId: string, input: Raw & { action: string }): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'updateSquadApplication')({ applicationId, ...input });
  }
}
