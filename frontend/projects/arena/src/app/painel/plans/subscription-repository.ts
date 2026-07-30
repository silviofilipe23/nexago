import { doc, getDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { normalizeArenaPlanTier, type ArenaBillingCycle, type ArenaPlanTier } from '../data/arena-plan.model';

/** Espelha `functions/src/arena-subscription.ts` — as duas únicas Cloud Functions reais
 *  de billing de plano (não há callable de troca/upgrade entre dois planos pagos: trocar
 *  de Pro para Elite hoje exigiria cancelar e assinar de novo, sem transição limpa). */

export type ArenaAsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';

export interface CreateArenaSubscriptionResult {
  subscriptionId: string;
  paymentId: string;
  billingType: ArenaAsaasBillingType;
  tier: ArenaPlanTier;
  cycle: ArenaBillingCycle;
  /** Checkout hospedado Asaas (cartão/indefinido) — nenhum dado de cartão passa pelo nosso backend. */
  invoiceUrl: string | null;
  /** Só preenchido para PIX. */
  qrCode: string | null;
  qrCodeBase64: string | null;
}

export async function createArenaSubscription(
  functions: Functions,
  arenaId: string,
  tier: ArenaPlanTier,
  cycle: ArenaBillingCycle,
  billingType: 'PIX' | 'CREDIT_CARD' | undefined,
  cpfCnpj: string | undefined,
): Promise<CreateArenaSubscriptionResult> {
  const call = httpsCallable<Record<string, unknown>, CreateArenaSubscriptionResult>(functions, 'createArenaSubscription');
  const result = await call({
    arenaId,
    tier,
    cycle,
    ...(billingType ? { billingType } : {}),
    ...(cpfCnpj ? { cpfCnpj } : {}),
  });
  return result.data;
}

export async function cancelArenaSubscription(functions: Functions, arenaId: string): Promise<void> {
  const call = httpsCallable(functions, 'cancelArenaSubscription');
  await call({ arenaId });
}

export type ArenaSubscriptionBillingStatus = 'pending' | 'active' | 'overdue' | 'canceled';

export interface ArenaSubscriptionBilling {
  tier: ArenaPlanTier;
  cycle: ArenaBillingCycle;
  billingType: ArenaAsaasBillingType;
  valueCents: number;
  status: ArenaSubscriptionBillingStatus;
  updatedAt?: Date;
  /** Presente quando a ativação (R$97, única por arena) já foi cobrada na 1ª fatura da
   *  primeira assinatura. Campo novo — ausente em billings antigos. Espelha
   *  `activationFeePaidAt` gravado por `functions/src/asaas-arena-subscription-webhook.ts`. */
  activationFeePaidAt?: unknown;
}

/** `arenas/{arenaId}/billing/subscription` — doc único (não histórico), sobrescrito a
 *  cada evento de webhook. Não existe coleção de faturas/histórico de pagamento hoje. */
export async function fetchArenaSubscriptionBilling(db: Firestore, arenaId: string): Promise<ArenaSubscriptionBilling | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'billing', 'subscription'));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const tier = normalizeArenaPlanTier(data['tier']);
  const cycle = data['cycle'];
  if (tier == null) return null;
  if (cycle !== 'monthly' && cycle !== 'yearly') return null;
  const status = data['status'];
  const updatedAtRaw = data['updatedAt'];
  return {
    tier,
    cycle,
    billingType: (data['billingType'] as ArenaAsaasBillingType | undefined) ?? 'UNDEFINED',
    valueCents: typeof data['valueCents'] === 'number' ? data['valueCents'] : 0,
    status: status === 'active' || status === 'overdue' || status === 'canceled' ? status : 'pending',
    updatedAt: updatedAtRaw instanceof Timestamp ? updatedAtRaw.toDate() : undefined,
    activationFeePaidAt: data['activationFeePaidAt'],
  };
}
