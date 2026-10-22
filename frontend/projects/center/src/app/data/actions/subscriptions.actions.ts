import { Injectable } from '@angular/core';
import { runTransaction, serverTimestamp } from 'firebase/firestore';
import { formatDayKey } from '../../domain/dates';
import type { Subscription } from '../../domain/models';
import { db } from '../firebase';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

export interface ChangePlanResult {
  when: 'now' | 'next_cycle';
  chargedCents: number;
  invoiceId: string | null;
  invoiceUrl: string;
  effectiveFrom: string;
}

export interface ChargeNowResult {
  invoiceId: string;
  invoiceUrl: string;
  generated: boolean;
  issueError: string;
}

/**
 * Assinaturas: o servidor cria e anda com elas (rodada diária, régua). Daqui o gestor agenda ou
 * desfaz o cancelamento no fim do ciclo; mudar de plano e cobrar agora vão por callable (mexem no
 * contrato e no provedor).
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsActions extends CenterActionsBase {
  /** Cancela no próximo vencimento: a rodada não gera esse ciclo e encerra a matrícula no dia. */
  async cancelAtCycleEnd(s: Subscription): Promise<void> {
    this.assertWritable();
    const ref = this.ref('subscriptions', s.id);
    await runTransaction(db(), async (t) => {
      const cur = (await t.get(ref)).data();
      if (!cur || !['active', 'past_due'].includes(String(cur['status']))) {
        throw new Error('A assinatura mudou. Recarregue e tente de novo.');
      }
      const at = String(cur['nextChargeDate'] ?? '');
      const a = this.actor();
      t.update(ref, { status: 'canceling', cancelAt: at, cancelRequestedAt: serverTimestamp(), cancelRequestedBy: a.name, updatedAt: serverTimestamp() });
      const audit = this.auditDoc({
        action: 'subscription.cancel_scheduled',
        entity: 'subscription',
        entityId: s.id,
        detail: `${s.payerName} · ${s.planName} · encerra em ${formatDayKey(at)} (fim do ciclo)`,
      });
      t.set(audit.ref, audit.data);
    });
  }

  async undoCancel(s: Subscription): Promise<void> {
    this.assertWritable();
    const ref = this.ref('subscriptions', s.id);
    await runTransaction(db(), async (t) => {
      const cur = (await t.get(ref)).data();
      if (!cur || cur['status'] !== 'canceling') {
        throw new Error('A assinatura mudou. Recarregue e tente de novo.');
      }
      t.update(ref, { status: 'active', cancelAt: null, cancelRequestedAt: null, cancelRequestedBy: null, updatedAt: serverTimestamp() });
      const audit = this.auditDoc({
        action: 'subscription.cancel_undone',
        entity: 'subscription',
        entityId: s.id,
        detail: `${s.payerName} · cancelamento no fim do ciclo desfeito`,
      });
      t.set(audit.ref, audit.data);
    });
  }

  changePlan(s: Subscription, planId: string, when: 'now' | 'next_cycle'): Promise<ChangePlanResult> {
    this.assertWritable();
    return callCenterFunction<ChangePlanResult>('changeTrainingCenterSubscriptionPlan', {
      centerId: this.centerId(),
      subscriptionId: s.id,
      planId,
      when,
    });
  }

  chargeNow(s: Subscription): Promise<ChargeNowResult> {
    this.assertWritable();
    return callCenterFunction<ChargeNowResult>('chargeTrainingCenterSubscriptionNow', {
      centerId: this.centerId(),
      subscriptionId: s.id,
    });
  }
}
