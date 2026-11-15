import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import {
  arenaFeeDefaultsFromRaw,
  arenaFeeOverrideFromRaw,
  type ArenaFeeDefaults,
  type ArenaFeeOverride,
  type ArenaFeeProduct,
} from './arena-fees';

type Raw = Record<string, unknown>;

export interface ArenaFeeDefaultsEntry {
  defaults: ArenaFeeDefaults;
  /** Doc ausente = 1: o padrão de código. */
  version: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface ArenaFeeOverrideEntry {
  /** `null` = a arena voltou ao padrão (o doc fica, pela versão). */
  override: ArenaFeeOverride | null;
  version: number;
}

export interface ArenaFeeLogEntry {
  id: string;
  changes: string[];
  reason: string | null;
  createdAt: Date | null;
  createdBy: string | null;
}

export interface SaveArenaFeeInput {
  arenaId: string;
  mode: 'padrao' | 'custom';
  products?: Partial<Record<ArenaFeeProduct, number>>;
  reason?: string;
  until?: string | null;
  version: number;
}

function dateOf(v: unknown): Date | null {
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

function byName(v: unknown): string | null {
  return (v as { name?: string } | null)?.name ?? null;
}

/**
 * Leitura direto do Firestore (só admin lê `arenaFees` e o log); escrita só pelas callables de
 * `functions/src/arena-fees.ts`, que gravam a regra e o histórico.
 */
@Injectable({ providedIn: 'root' })
export class ArenaFeesRepository {
  async defaults(): Promise<ArenaFeeDefaultsEntry> {
    const snap = await getDoc(doc(backofficeDb(), 'appConfig', 'arenaFees'));
    const data = snap.exists() ? (snap.data() as Raw) : undefined;
    return {
      defaults: arenaFeeDefaultsFromRaw(data),
      version: typeof data?.['version'] === 'number' ? data['version'] : 1,
      updatedAt: dateOf(data?.['updatedAt']),
      updatedBy: byName(data?.['updatedBy']),
    };
  }

  /** Todas as exceções (a coleção só tem arena que já foi editada aqui). */
  async overrides(): Promise<Map<string, ArenaFeeOverrideEntry>> {
    const snap = await getDocs(collection(backofficeDb(), 'arenaFees'));
    return new Map(
      snap.docs.map((d) => {
        const data = d.data() as Raw;
        return [
          d.id,
          { override: arenaFeeOverrideFromRaw(data), version: typeof data['version'] === 'number' ? data['version'] : 0 },
        ];
      }),
    );
  }

  /** Histórico de uma arena, ou do padrão (`null`), do mais recente para trás. */
  async log(arenaId: string | null): Promise<ArenaFeeLogEntry[]> {
    const col = collection(backofficeDb(), 'arenaFeesLog');
    // Só igualdade: ordena aqui e dispensa índice composto.
    const filter = arenaId ? where('arenaId', '==', arenaId) : where('scope', '==', 'default');
    const snap = await getDocs(query(col, filter, limit(100)));
    return snap.docs
      .map((d) => {
        const data = d.data() as Raw;
        return {
          id: d.id,
          changes: Array.isArray(data['changes']) ? (data['changes'] as string[]) : [],
          reason: (data['reason'] as string | null) ?? null,
          createdAt: dateOf(data['createdAt']),
          createdBy: byName(data['createdBy']),
        };
      })
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async saveDefault(defaults: ArenaFeeDefaults, version: number): Promise<void> {
    await httpsCallable<ArenaFeeDefaults & { version: number }, Raw>(
      backofficeFunctions(),
      'saveArenaFeeDefault',
    )({ ...defaults, version });
  }

  async saveArenaFee(input: SaveArenaFeeInput): Promise<ArenaFeeOverrideEntry> {
    const r = await httpsCallable<SaveArenaFeeInput, Raw>(backofficeFunctions(), 'saveArenaFee')(input);
    return {
      override: r.data['override'] ? arenaFeeOverrideFromRaw({ mode: 'custom', ...(r.data['override'] as Raw) }) : null,
      version: Number(r.data['version']),
    };
  }
}
