import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import type { SquadTier } from '../../niveis-regras/data/squad-rules';
import {
  DEFAULT_PAYOUT_CONFIG,
  commissionFromDoc,
  payoutFromDoc,
  periodRange,
  type Adjustment,
  type Commission,
  type Payout,
  type PayoutConfig,
  type Period,
} from './commission';

/** O que a faixa e o drawer do repasse precisam, independente do período da tabela. */
export interface PayoutState {
  released: Commission[];
  adjustments: Adjustment[];
  payouts: Payout[];
  config: PayoutConfig;
}

export interface AmbassadorOption {
  id: string;
  name: string;
  tier: SquadTier | null;
  pct: number | null;
}

export interface ApproveResult {
  payoutId: string;
  status: 'done' | 'partial';
  creditedCount: number;
  failedCount: number;
  totalCents: number;
}

type Raw = Record<string, unknown>;

/**
 * Leitura direto do Firestore; escrita só pelas callables de `functions/src/squad-commissions.ts`
 * (as rules negam escrita de cliente em comissões, repasses e carteiras).
 */
@Injectable({ providedIn: 'root' })
export class CommissionsRepository {
  /** Comissões do período, pela data da inscrição, mais recentes primeiro. */
  async load(period: Period): Promise<Commission[]> {
    const { start, end } = periodRange(period);
    const constraints: QueryConstraint[] = [];
    if (start) constraints.push(where('registeredAt', '>=', start));
    if (end) constraints.push(where('registeredAt', '<', end));
    constraints.push(orderBy('registeredAt', 'desc'));
    const snap = await getDocs(query(collection(backofficeDb(), 'squadCommissions'), ...constraints));
    return snap.docs.map((d) => commissionFromDoc(d.id, d.data() as Raw));
  }

  async payoutState(): Promise<PayoutState> {
    const db = backofficeDb();
    const [released, adjustments, payouts, config] = await Promise.all([
      getDocs(query(collection(db, 'squadCommissions'), where('status', '==', 'released'))),
      getDocs(query(collection(db, 'squadCommissionAdjustments'), where('payoutId', '==', null))),
      getDocs(collection(db, 'squadPayouts')),
      getDoc(doc(db, 'squadConfig', 'payout')),
    ]);
    const c = (config.exists() ? config.data() : {}) as Raw;
    const days = Array.isArray(c['days']) ? (c['days'] as unknown[]).filter((n): n is number => Number.isInteger(n)) : [];
    return {
      released: released.docs.map((d) => commissionFromDoc(d.id, d.data() as Raw)),
      adjustments: adjustments.docs.map((d) => ({
        id: d.id,
        ambassadorId: String((d.data() as Raw)['ambassadorId'] ?? ''),
        ambassadorName: String((d.data() as Raw)['ambassadorName'] ?? ''),
        amountCents: Number((d.data() as Raw)['amountCents'] ?? 0),
      })),
      payouts: payouts.docs.map((d) => payoutFromDoc(d.id, d.data() as Raw)).sort((a, b) => b.id.localeCompare(a.id)),
      config: {
        days: days.length > 0 ? days : DEFAULT_PAYOUT_CONFIG.days,
        minNetCents: typeof c['minNetCents'] === 'number' ? (c['minNetCents'] as number) : DEFAULT_PAYOUT_CONFIG.minNetCents,
      },
    };
  }

  /** Contratos ativos, para reatribuir. */
  async ambassadors(): Promise<AmbassadorOption[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'squadAmbassadors'), where('status', '==', 'active')));
    return snap.docs
      .map((d) => {
        const a = d.data() as Raw;
        return {
          id: d.id,
          name: String(a['displayName'] ?? d.id),
          tier: (a['tier'] as SquadTier | undefined) ?? null,
          pct: typeof a['commissionPct'] === 'number' ? (a['commissionPct'] as number) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async approve(payoutDate: string): Promise<ApproveResult> {
    const r = await httpsCallable<{ payoutDate: string }, ApproveResult>(backofficeFunctions(), 'approveSquadPayout')({
      payoutDate,
    });
    return r.data;
  }

  /** `reason: null` desfaz a retenção. */
  async setHold(commissionIds: string[], payoutDate: string, reason: string | null): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'setSquadCommissionHold')({ commissionIds, payoutDate, reason });
  }

  async cancel(commissionId: string, reason: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'cancelSquadCommission')({ commissionId, reason });
  }

  async reassign(commissionId: string, ambassadorId: string, reason: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'reassignSquadCommission')({ commissionId, ambassadorId, reason });
  }
}
