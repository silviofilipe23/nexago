import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import {
  DEFAULT_PLANS,
  planFromRaw,
  rulesFromRaw,
  scheduledFromRaw,
  sponsorsFromRaw,
  type PlanEntry,
  type PlanRules,
  type ScheduledPlan,
  type SponsorsConfig,
  type TournamentPlan,
} from './tournament-plans';

type Raw = Record<string, unknown>;

export interface Versioned<T> {
  value: T;
  /** Doc ausente = 1: o padrão. */
  version: number;
}

export type LogScope = 'plan' | 'rules' | 'sponsors';

export interface LogEntry {
  id: string;
  scope: LogScope;
  planId: string | null;
  planName: string | null;
  version: number;
  changes: string[];
  effectiveFrom: string | null;
  createdAt: Date | null;
  createdBy: string | null;
}

export interface SavePlanResult {
  planId: string;
  version: number;
  current: TournamentPlan | null;
  next: ScheduledPlan | null;
  draft: TournamentPlan | null;
}

function dateOf(v: unknown): Date | null {
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

function byName(v: unknown): string | null {
  return (v as { name?: string } | null)?.name ?? null;
}

function entryOf(id: string, data: Raw | undefined): PlanEntry | null {
  const fallback = DEFAULT_PLANS.find((p) => p.id === id);
  if (!data) {
    return fallback
      ? { id, order: fallback.order, version: 1, current: structuredClone(fallback.plan), next: null, draft: null,
          updatedAt: null, updatedBy: null }
      : null;
  }
  return {
    id,
    order: typeof data['order'] === 'number' ? data['order'] : fallback?.order ?? 99,
    version: typeof data['version'] === 'number' ? data['version'] : fallback ? 1 : 0,
    current: planFromRaw(data['current']),
    next: scheduledFromRaw(data['next']),
    draft: planFromRaw(data['draft']),
    updatedAt: dateOf(data['updatedAt']),
    updatedBy: byName(data['updatedBy']),
  };
}

/**
 * Leitura direto do Firestore (só admin lê); escrita só pelas callables de
 * `functions/src/tournament-plans.ts`, que gravam vigente, retrato da versão e log.
 */
@Injectable({ providedIn: 'root' })
export class TournamentPlansRepository {
  /** Os 4 padrões (mesmo sem doc) + os criados, na ordem da vitrine. */
  async plans(): Promise<PlanEntry[]> {
    const snap = await getDocs(collection(backofficeDb(), 'tournamentPlans'));
    const docs = new Map(snap.docs.map((d) => [d.id, d.data() as Raw]));
    const ids = new Set([...DEFAULT_PLANS.map((p) => p.id), ...docs.keys()]);
    return [...ids]
      .map((id) => entryOf(id, docs.get(id)))
      .filter((e): e is PlanEntry => e !== null)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  /** `null` = não existe (id inventado ou plano novo descartado). */
  async plan(id: string): Promise<PlanEntry | null> {
    const snap = await getDoc(doc(backofficeDb(), 'tournamentPlans', id));
    return entryOf(id, snap.exists() ? (snap.data() as Raw) : undefined);
  }

  async rules(): Promise<Versioned<PlanRules>> {
    return this.config('rules', rulesFromRaw);
  }

  async sponsors(): Promise<Versioned<SponsorsConfig>> {
    return this.config('sponsors', sponsorsFromRaw);
  }

  private async config<T>(id: 'rules' | 'sponsors', parse: (v: unknown) => T): Promise<Versioned<T>> {
    const snap = await getDoc(doc(backofficeDb(), 'tournamentPlansConfig', id));
    const data = snap.exists() ? (snap.data() as Raw) : undefined;
    return { value: parse(data?.[id]), version: typeof data?.['version'] === 'number' ? data['version'] : 1 };
  }

  /** As 60 entradas mais recentes; a tela filtra pelo escopo. */
  async log(): Promise<LogEntry[]> {
    const col = collection(backofficeDb(), 'tournamentPlansLog');
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc'), limit(60)));
    return snap.docs.map((d) => {
      const data = d.data() as Raw;
      return {
        id: d.id,
        scope: (data['scope'] as LogScope) ?? 'plan',
        planId: (data['planId'] as string | null) ?? null,
        planName: (data['planName'] as string | null) ?? null,
        version: Number(data['version']) || 0,
        changes: Array.isArray(data['changes']) ? (data['changes'] as string[]) : [],
        effectiveFrom: (data['effectiveFrom'] as string | null) ?? null,
        createdAt: dateOf(data['createdAt']),
        createdBy: byName(data['createdBy']),
      };
    });
  }

  async savePlan(input: {
    planId: string | null;
    action: 'draft' | 'publish' | 'discardDraft';
    plan?: TournamentPlan;
    version: number;
    effectiveFrom?: string | null;
  }): Promise<SavePlanResult> {
    const r = await httpsCallable<typeof input, Raw>(backofficeFunctions(), 'saveTournamentPlan')(input);
    return {
      planId: String(r.data['planId']),
      version: Number(r.data['version']),
      current: planFromRaw(r.data['current']),
      next: scheduledFromRaw(r.data['next']),
      draft: planFromRaw(r.data['draft']),
    };
  }

  async saveRules(rules: PlanRules, version: number): Promise<Versioned<PlanRules>> {
    const r = await httpsCallable<{ rules: PlanRules; version: number }, Raw>(
      backofficeFunctions(),
      'saveTournamentPlanRules',
    )({ rules, version });
    return { value: rulesFromRaw(r.data['rules']), version: Number(r.data['version']) };
  }

  async saveSponsors(sponsors: SponsorsConfig, version: number): Promise<Versioned<SponsorsConfig>> {
    const r = await httpsCallable<{ sponsors: SponsorsConfig; version: number }, Raw>(
      backofficeFunctions(),
      'saveTournamentSponsors',
    )({ sponsors, version });
    return { value: sponsorsFromRaw(r.data['sponsors']), version: Number(r.data['version']) };
  }
}
