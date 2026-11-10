import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { friendlyCallableError } from '../planos-horario/schedule-plan-repository';
import type {
  CrmContactChannel,
  CrmContactOutcome,
  CrmContactReason,
  CrmCustomer,
  CrmCustomerDetail,
  CrmOverview,
  CrmPaymentMethod,
  CrmPeriod,
} from './crm.model';

export interface ContractDraft {
  contractId?: string | null;
  athleteId: string | null;
  customerName: string;
  customerPhone: string | null;
  planId: string | null;
  planName: string;
  period: CrmPeriod;
  dueDay: number;
  timesPerWeek: number;
  monthlyPriceReais: number;
  startDate: string;
  autoRenew: boolean;
  note: string | null;
}

export class CrmError extends Error {}

/** Estado do CRM: a visão geral vem de uma callable só (`getArenaCrmOverview`) e é recarregada
 *  depois de cada escrita. Uma instância por página (provider do componente). */
@Injectable()
export class CrmStore {
  private readonly arenaContext = inject(ArenaContextService);

  readonly overview = signal<CrmOverview | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly customers = computed(() => this.overview()?.customers ?? []);
  readonly byKey = computed(() => new Map(this.customers().map((c) => [c.key, c])));
  readonly today = computed(() => this.overview()?.today ?? new Date().toISOString().slice(0, 10));
  readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'arena');
  readonly queueTotal = computed(() => {
    const q = this.overview()?.queues;
    return q ? q.dueThisWeek.length + q.notRenewed.length + q.overdue.length + q.absent.length : 0;
  });

  private loadedFor: string | null = null;
  private seq = 0;

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId && arenaId !== this.loadedFor) void this.reload();
    });
  }

  async reload(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    const seq = ++this.seq;
    if (this.loadedFor !== arenaId) {
      this.loadedFor = arenaId;
      this.overview.set(null);
      this.loading.set(true);
    }
    this.loadError.set(null);
    try {
      const data = await this.call<CrmOverview>('getArenaCrmOverview', { arenaId });
      if (seq === this.seq) this.overview.set(data);
    } catch (err) {
      if (seq === this.seq) this.loadError.set(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.');
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  customerDetail(customerKey: string): Promise<CrmCustomerDetail> {
    return this.call('getArenaCrmCustomer', { arenaId: this.arenaContext.arenaId(), customerKey });
  }

  async saveContract(draft: ContractDraft): Promise<string> {
    const r = await this.update<{ contractId: string }>('saveContract', { ...draft });
    void this.reload();
    return r.contractId;
  }

  async cancelContract(contractId: string, reason: string): Promise<void> {
    await this.update('cancelContract', { contractId, reason });
    void this.reload();
  }

  async renewContract(contractId: string, changes: { period: CrmPeriod; dueDay: number; monthlyPriceReais: number; autoRenew: boolean }): Promise<string> {
    const r = await this.update<{ contractId: string }>('renewContract', { contractId, ...changes });
    void this.reload();
    return r.contractId;
  }

  async registerPayment(contractId: string, installments: number, method: CrmPaymentMethod, amountReais: number, paidOn: string): Promise<void> {
    await this.update('registerPayment', { contractId, installments, method, amountReais, paidOn });
    void this.reload();
  }

  async logContact(c: CrmCustomer, reason: CrmContactReason, outcome: CrmContactOutcome, channel: CrmContactChannel, note: string | null): Promise<void> {
    await this.update('logContact', {
      customerKey: c.key,
      contractId: c.contract?.source === 'contract' ? c.contract.id : null,
      channel,
      reason,
      outcome,
      note,
    });
    void this.reload();
  }

  async saveGoal(monthlyGoal: number): Promise<void> {
    await this.update('saveSettings', { monthlyGoal });
    void this.reload();
  }

  private update<T = unknown>(op: string, payload: Record<string, unknown>): Promise<T> {
    return this.call<T>('updateArenaCrm', { arenaId: this.arenaContext.arenaId(), op, ...payload });
  }

  private async call<T>(name: string, input: Record<string, unknown>): Promise<T> {
    try {
      return (await httpsCallable<Record<string, unknown>, T>(arenaFunctions(), name)(input)).data;
    } catch (err) {
      throw new CrmError(friendlyCallableError(err));
    }
  }
}
