import { Injectable } from '@angular/core';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import { EMPTY_ACTIVITY, modelFrom, type BillingModel, type MonthActivity } from './billing-model';

export interface PreviewArena {
  id: string;
  name: string;
  city: string | null;
  startMonth: string | null;
  planTier: string | null;
  planStatus: string | null;
  activity: MonthActivity;
}

export interface BillingOverview {
  model: BillingModel;
  version: number;
  /** `false` = ninguém salvou: o modelo é o de exemplo. */
  saved: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
  month: string;
  arenas: PreviewArena[];
}

export interface BillingVersion {
  version: number;
  model: BillingModel;
  createdAt: Date | null;
  createdBy: string | null;
  note: string | null;
  changes: string[];
  restoredFrom: number | null;
}

type Raw = Record<string, unknown>;

function dateOf(v: unknown): Date | null {
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

function activityOf(raw: unknown): MonthActivity {
  const a = (raw ?? {}) as Partial<MonthActivity>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    paidBookings: n(a.paidBookings),
    bookingVolumeCents: n(a.bookingVolumeCents),
    schedulePlanVolumeCents: n(a.schedulePlanVolumeCents),
    currentFeeCents: n(a.currentFeeCents),
  };
}

/**
 * Leitura do modelo + prévia por arena pela callable `getArenaBillingOverview` (o extrato das
 * carteiras só o servidor lê); gravação versionada por `saveArenaBillingModel`; histórico direto
 * do Firestore (`arenaBillingConfig/model/versions`, leitura só de admin nas rules).
 */
@Injectable({ providedIn: 'root' })
export class BillingModelRepository {
  async overview(month: string): Promise<BillingOverview> {
    const r = await httpsCallable<{ month: string }, Raw>(backofficeFunctions(), 'getArenaBillingOverview')({ month });
    const d = r.data;
    const arenas = Array.isArray(d['arenas']) ? (d['arenas'] as Raw[]) : [];
    return {
      model: modelFrom(d['model']),
      version: typeof d['version'] === 'number' ? (d['version'] as number) : 1,
      saved: d['saved'] === true,
      updatedAt: dateOf(d['updatedAt']),
      updatedBy: typeof d['updatedBy'] === 'string' ? (d['updatedBy'] as string) : null,
      month: typeof d['month'] === 'string' ? (d['month'] as string) : month,
      arenas: arenas.map((a) => ({
        id: String(a['id']),
        name: typeof a['name'] === 'string' ? (a['name'] as string) : `Arena ${a['id']}`,
        city: typeof a['city'] === 'string' ? (a['city'] as string) : null,
        startMonth: typeof a['startMonth'] === 'string' ? (a['startMonth'] as string) : null,
        planTier: typeof a['planTier'] === 'string' ? (a['planTier'] as string) : null,
        planStatus: typeof a['planStatus'] === 'string' ? (a['planStatus'] as string) : null,
        activity: a['activity'] ? activityOf(a['activity']) : { ...EMPTY_ACTIVITY },
      })),
    };
  }

  /** As 30 versões mais recentes, da atual para trás. */
  async versions(): Promise<BillingVersion[]> {
    const col = collection(backofficeDb(), 'arenaBillingConfig', 'model', 'versions');
    const snap = await getDocs(query(col, orderBy('version', 'desc'), limit(30)));
    return snap.docs.map((doc) => {
      const data = doc.data() as Raw;
      const by = data['createdBy'] as { name?: string } | null;
      return {
        version: Number(data['version']),
        model: modelFrom(data['model']),
        createdAt: dateOf(data['createdAt']),
        createdBy: by?.name ?? null,
        note: typeof data['note'] === 'string' ? (data['note'] as string) : null,
        changes: Array.isArray(data['changes']) ? (data['changes'] as string[]) : [],
        restoredFrom: typeof data['restoredFrom'] === 'number' ? (data['restoredFrom'] as number) : null,
      };
    });
  }

  async save(
    model: BillingModel,
    version: number,
    note: string | null,
    restoredFrom: number | null,
  ): Promise<{ model: BillingModel; version: number; changes: string[] }> {
    const r = await httpsCallable<
      { model: BillingModel; version: number; note: string | null; restoredFrom: number | null },
      { model: BillingModel; version: number; changes: string[] }
    >(backofficeFunctions(), 'saveArenaBillingModel')({ model, version, note, restoredFrom });
    return { model: modelFrom(r.data.model), version: r.data.version, changes: r.data.changes };
  }
}
