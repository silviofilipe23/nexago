import { Injectable, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { type CrmContactReason, type CrmCustomer, type CrmQueueId, queueMessage, QUEUE_REASON, whatsappUrl } from './crm.model';
import type { ContractDraft } from './crm.store';
import { CrmStore } from './crm.store';

export interface ContractFormState {
  mode: 'new' | 'edit' | 'renew';
  /** Cliente já escolhido (oferta, ficha) — `null` = escolher no formulário. */
  customer: CrmCustomer | null;
  prefill: Partial<ContractDraft>;
  contractId: string | null;
}

/** O que está aberto na página do CRM (ficha, formulário de contrato, pagamento) e as ações
 *  que qualquer aba dispara. Um por página, junto do `CrmStore`. */
@Injectable()
export class CrmUiService {
  private readonly store = inject(CrmStore);
  private readonly access = inject(ArenaAccessService);

  readonly drawerKey = signal<string | null>(null);
  readonly contractForm = signal<ContractFormState | null>(null);
  readonly paymentFor = signal<CrmCustomer | null>(null);
  /** Modal "Cobrar online" (link Pix/cartão). */
  readonly chargeFor = signal<CrmCustomer | null>(null);
  readonly toast = signal<string | null>(null);

  readonly canWrite = (): boolean => this.access.canWrite('agenda');

  openCustomer(key: string): void {
    this.drawerKey.set(key);
  }

  newContract(customer: CrmCustomer | null = null, prefill: Partial<ContractDraft> = {}): void {
    this.contractForm.set({ mode: 'new', customer, prefill, contractId: null });
  }

  /** Oferta aceita: contrato nasce com o plano sugerido, o valor e as horas que ele já joga por semana. */
  contractFromOffer(c: CrmCustomer): void {
    const s = c.conversion?.suggestion;
    const plan = s ? this.store.overview()?.plans.find((p) => p.id === s.planId) : undefined;
    this.newContract(c, {
      planId: s?.planId ?? null,
      planName: s?.planName ?? '',
      monthlyPriceReais: s?.monthlyPriceReais ?? c.conversion?.avgMonthlyReais ?? 0,
      // O banco de horas nasce com as horas que ele já joga de avulso.
      weeklyHours: c.conversion?.weeklyHours ?? plan?.weeklyHours ?? 2,
    });
  }

  /** Abre o WhatsApp com a mensagem da fila e registra o contato (o cliente desce na fila). */
  async whatsapp(c: CrmCustomer, text: string, reason: CrmContactReason): Promise<void> {
    if (!c.whatsapp) return;
    window.open(whatsappUrl(c.whatsapp, text), '_blank', 'noopener');
    if (!this.canWrite()) return;
    try {
      await this.store.logContact(c, reason, 'done', 'whatsapp', null);
    } catch {
      this.flash('A mensagem abriu, mas o contato não foi registrado.');
    }
  }

  queueWhatsapp(queue: CrmQueueId, c: CrmCustomer): void {
    const item = this.store.overview()?.queues[queue].find((i) => i.key === c.key);
    if (!item) return;
    void this.whatsapp(c, queueMessage(queue, c, item, this.store.arenaName()), QUEUE_REASON[queue]);
  }

  flash(message: string): void {
    this.toast.set(message);
    setTimeout(() => {
      if (this.toast() === message) this.toast.set(null);
    }, 4000);
  }
}
