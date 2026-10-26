import { Injectable } from '@angular/core';
import {
  collection,
  count,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  limit,
  query,
  sum,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import {
  feeDefaultsFromRaw,
  feeOverrideFromRaw,
  isValidCommission,
  type FeeMode,
  type FeeRule,
  type TournamentFeeOverride,
} from './tournament-fees';

type Raw = Record<string, unknown>;

export interface FeeDefaults {
  rule: FeeRule;
  /** Doc ausente = 1: o padrão de código. */
  version: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface FeeOverrideEntry {
  tournamentId: string;
  /** `null` = o torneio voltou ao padrão (o doc fica, pela versão). */
  override: TournamentFeeOverride | null;
  version: number;
}

export interface OrganizerFeeInfo {
  name: string | null;
  /** Comissão negociada no cadastro (`organizers/{uid}.commissionPercent`); `null` = sem cadastro. */
  commissionPercent: number | null;
}

export interface TournamentRevenue {
  /** Soma de `platformFeeReais` do extrato do caixa do torneio. */
  feeReais: number;
  grossReais: number;
  payments: number;
}

export interface FeeLogEntry {
  id: string;
  scope: 'default' | 'tournament';
  tournamentId: string | null;
  changes: string[];
  reason: string | null;
  createdAt: Date | null;
  createdBy: string | null;
}

export interface SaveTournamentFeeInput {
  tournamentId: string;
  mode: FeeMode;
  percent?: number;
  floorReais?: number;
  reason?: string;
  until?: string | null;
  notify: boolean;
  version: number;
}

function dateOf(v: unknown): Date | null {
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

function byName(v: unknown): string | null {
  return (v as { name?: string } | null)?.name ?? null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function money(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/**
 * Leitura direto do Firestore (só admin lê `tournamentFees`, o log e o caixa); escrita só pelas
 * callables de `functions/src/tournament-fees.ts`, que gravam a regra e o histórico.
 */
@Injectable({ providedIn: 'root' })
export class TournamentFeesRepository {
  async defaults(): Promise<FeeDefaults> {
    const snap = await getDoc(doc(backofficeDb(), 'appConfig', 'tournamentFees'));
    const data = snap.exists() ? (snap.data() as Raw) : undefined;
    return {
      rule: feeDefaultsFromRaw(data),
      version: typeof data?.['version'] === 'number' ? data['version'] : 1,
      updatedAt: dateOf(data?.['updatedAt']),
      updatedBy: byName(data?.['updatedBy']),
    };
  }

  /** Todas as exceções (a coleção só tem torneio que já foi editado aqui). */
  async overrides(): Promise<Map<string, FeeOverrideEntry>> {
    const snap = await getDocs(collection(backofficeDb(), 'tournamentFees'));
    return new Map(
      snap.docs.map((d) => {
        const data = d.data() as Raw;
        const version = typeof data['version'] === 'number' ? data['version'] : 0;
        return [d.id, { tournamentId: d.id, override: feeOverrideFromRaw(data), version }];
      }),
    );
  }

  /** Nome e comissão negociada de cada organizador (uma leitura por uid). */
  async organizers(uids: readonly string[]): Promise<Map<string, OrganizerFeeInfo>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[string, OrganizerFeeInfo]> => {
        const [terms, user] = await Promise.all([
          getDoc(doc(backofficeDb(), 'organizers', uid)),
          getDoc(doc(backofficeDb(), 'users', uid)).catch(() => null),
        ]);
        const commission = terms.exists() ? (terms.data() as Raw)['commissionPercent'] : null;
        const u = user?.exists() ? (user.data() as Raw) : {};
        const profile = (u['organizerProfile'] ?? {}) as Raw;
        return [
          uid,
          {
            name: str(profile['orgName']) ?? str(u['fullName']) ?? str(u['displayName']),
            commissionPercent: isValidCommission(commission) ? commission : null,
          },
        ];
      }),
    );
    return new Map(entries);
  }

  /** Taxa já cobrada no torneio: agregação do extrato do caixa (só créditos de inscrição). */
  async revenue(tournamentId: string): Promise<TournamentRevenue> {
    const ledger = collection(backofficeDb(), 'tournamentWallets', tournamentId, 'ledger');
    const snap = await getAggregateFromServer(ledger, {
      fee: sum('platformFeeReais'),
      gross: sum('grossReais'),
      payments: count(),
    });
    const data = snap.data();
    return { feeReais: money(data.fee), grossReais: money(data.gross), payments: data.payments };
  }

  /** Histórico de um torneio, ou do padrão (`null`), do mais recente para trás. */
  async log(tournamentId: string | null): Promise<FeeLogEntry[]> {
    const col = collection(backofficeDb(), 'tournamentFeesLog');
    // Só igualdade: ordena aqui e dispensa índice composto.
    const filter = tournamentId ? where('tournamentId', '==', tournamentId) : where('scope', '==', 'default');
    const snap = await getDocs(query(col, filter, limit(100)));
    return snap.docs
      .map((d) => {
        const data = d.data() as Raw;
        return {
          id: d.id,
          scope: data['scope'] === 'default' ? ('default' as const) : ('tournament' as const),
          tournamentId: (data['tournamentId'] as string | null) ?? null,
          changes: Array.isArray(data['changes']) ? (data['changes'] as string[]) : [],
          reason: (data['reason'] as string | null) ?? null,
          createdAt: dateOf(data['createdAt']),
          createdBy: byName(data['createdBy']),
        };
      })
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async saveDefault(rule: FeeRule, version: number): Promise<{ rule: FeeRule; version: number }> {
    const r = await httpsCallable<FeeRule & { version: number }, Raw>(
      backofficeFunctions(),
      'saveTournamentFeeDefault',
    )({ ...rule, version });
    return { rule: feeDefaultsFromRaw(r.data), version: Number(r.data['version']) };
  }

  async saveTournamentFee(
    input: SaveTournamentFeeInput,
  ): Promise<{ override: TournamentFeeOverride | null; version: number; notified: boolean }> {
    const r = await httpsCallable<SaveTournamentFeeInput, Raw>(backofficeFunctions(), 'saveTournamentFee')(input);
    return {
      override: feeOverrideFromRaw(r.data['override']),
      version: Number(r.data['version']),
      notified: r.data['notified'] === true,
    };
  }
}
