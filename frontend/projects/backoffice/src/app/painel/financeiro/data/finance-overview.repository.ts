import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { backofficeFunctions } from '../../data/firebase';

export type ArenaPlanTier = 'starter' | 'pro' | 'elite';
export type CostCategory = 'fixed' | 'variable';

export interface PlatformCostItem {
  id: string;
  name: string;
  category: CostCategory;
  amountCents: number;
  notes: string | null;
}

export interface FinanceTierBreakdown {
  tier: ArenaPlanTier;
  count: number;
  mrrCents: number;
}

export interface BreakEvenTargetArena {
  id: string;
  name: string;
  city: string | null;
  whatsapp: string | null;
  contactAthletesCount: number;
}

export interface BreakEvenPlan {
  achieved: boolean;
  gapCents: number;
  plansNeeded: number;
  entryTier: ArenaPlanTier;
  entryPlanMonthlyCents: number;
  targetArenas: BreakEvenTargetArena[];
}

export interface FinanceOverview {
  mrrCents: number;
  arrCents: number;
  activeArenasCount: number;
  avgTicketCents: number;
  byTier: FinanceTierBreakdown[];
  fixedCostsCents: number;
  variableCostsCents: number;
  totalCostsCents: number;
  fixedCosts: PlatformCostItem[];
  variableCosts: PlatformCostItem[];
  breakEven: BreakEvenPlan;
}

export interface UpsertCostInput {
  id?: string;
  name: string;
  category: CostCategory;
  amountCents: number;
  notes?: string;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function tier(value: unknown): ArenaPlanTier {
  return value === 'pro' || value === 'elite' ? value : 'starter';
}

function toCostItem(raw: unknown): PlatformCostItem | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = str(row['id']);
  const name = str(row['name']);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    category: row['category'] === 'variable' ? 'variable' : 'fixed',
    amountCents: num(row['amountCents']),
    notes: str(row['notes']),
  };
}

function toTierBreakdown(raw: unknown): FinanceTierBreakdown | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  return { tier: tier(row['tier']), count: num(row['count']), mrrCents: num(row['mrrCents']) };
}

function toTargetArena(raw: unknown): BreakEvenTargetArena | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = str(row['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    name: str(row['name']) ?? id,
    city: str(row['city']),
    whatsapp: str(row['whatsapp']),
    contactAthletesCount: num(row['contactAthletesCount']),
  };
}

function toOverview(raw: unknown): FinanceOverview {
  const row = (raw ?? {}) as Record<string, unknown>;
  const breakEvenRaw = (row['breakEven'] ?? {}) as Record<string, unknown>;

  return {
    mrrCents: num(row['mrrCents']),
    arrCents: num(row['arrCents']),
    activeArenasCount: num(row['activeArenasCount']),
    avgTicketCents: num(row['avgTicketCents']),
    byTier: Array.isArray(row['byTier'])
      ? (row['byTier'] as unknown[]).map(toTierBreakdown).filter((v): v is FinanceTierBreakdown => v != null)
      : [],
    fixedCostsCents: num(row['fixedCostsCents']),
    variableCostsCents: num(row['variableCostsCents']),
    totalCostsCents: num(row['totalCostsCents']),
    fixedCosts: Array.isArray(row['fixedCosts'])
      ? (row['fixedCosts'] as unknown[]).map(toCostItem).filter((v): v is PlatformCostItem => v != null)
      : [],
    variableCosts: Array.isArray(row['variableCosts'])
      ? (row['variableCosts'] as unknown[]).map(toCostItem).filter((v): v is PlatformCostItem => v != null)
      : [],
    breakEven: {
      achieved: breakEvenRaw['achieved'] === true,
      gapCents: num(breakEvenRaw['gapCents']),
      plansNeeded: num(breakEvenRaw['plansNeeded']),
      entryTier: tier(breakEvenRaw['entryTier']),
      entryPlanMonthlyCents: num(breakEvenRaw['entryPlanMonthlyCents']),
      targetArenas: Array.isArray(breakEvenRaw['targetArenas'])
        ? (breakEvenRaw['targetArenas'] as unknown[])
            .map(toTargetArena)
            .filter((v): v is BreakEvenTargetArena => v != null)
        : [],
    },
  };
}

/** Visão CFO do financeiro: MRR/ARR reais, custos cadastrados e plano de ação de break-even. */
@Injectable({ providedIn: 'root' })
export class FinanceOverviewRepository {
  async getOverview(): Promise<FinanceOverview> {
    const callable = httpsCallable(backofficeFunctions(), 'getFinanceOverview');
    const result = await callable({});
    return toOverview(result.data);
  }

  async upsertCost(input: UpsertCostInput): Promise<void> {
    const callable = httpsCallable(backofficeFunctions(), 'upsertPlatformCost');
    await callable({ ...input, notes: input.notes ?? '' });
  }

  async deleteCost(id: string): Promise<void> {
    const callable = httpsCallable(backofficeFunctions(), 'deletePlatformCost');
    await callable({ id });
  }
}
