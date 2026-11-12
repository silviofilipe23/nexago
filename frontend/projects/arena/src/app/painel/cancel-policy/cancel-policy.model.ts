/**
 * Política de cancelamento pelo atleta (`arenas/{id}.athleteCancelPolicy`) — espelha
 * `functions/src/arena-athlete-cancel-policy.ts`. Vale para o cancelamento feito pelo
 * atleta dentro do prazo grátis (até 6h antes); a reserva guarda uma cópia na criação,
 * então mudar aqui vale para as reservas novas.
 */

export type AthleteCancelMode = 'refund' | 'credit';

export interface AthleteCancelPolicy {
  mode: AthleteCancelMode;
  /** Só no `refund`: quanto do valor pago volta (100 = integral). */
  refundPercent: number;
}

/** O que a arena escolhe na tela. */
export type AthleteCancelChoice = 'full' | 'partial' | 'credit';

export const PARTIAL_REFUND_PERCENTS = [75, 50, 25] as const;
const REFUND_PERCENTS: readonly number[] = [100, ...PARTIAL_REFUND_PERCENTS];

export const ATHLETE_FREE_CANCEL_HOURS = 6;

export const DEFAULT_ATHLETE_CANCEL_POLICY: AthleteCancelPolicy = { mode: 'refund', refundPercent: 100 };

export function normalizeAthleteCancelPolicy(raw: unknown): AthleteCancelPolicy {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (d['mode'] === 'credit') return { mode: 'credit', refundPercent: 0 };
  const pct = Number(d['refundPercent']);
  return { mode: 'refund', refundPercent: REFUND_PERCENTS.includes(pct) ? pct : 100 };
}

export function athleteCancelPolicyFromArenaDoc(doc: Record<string, unknown> | null | undefined): AthleteCancelPolicy {
  return normalizeAthleteCancelPolicy(doc?.['athleteCancelPolicy']);
}

export function athleteCancelChoice(policy: AthleteCancelPolicy): AthleteCancelChoice {
  if (policy.mode === 'credit') return 'credit';
  return policy.refundPercent >= 100 ? 'full' : 'partial';
}

/** Política ao trocar a escolha; no parcial começa em 50%. */
export function policyForChoice(choice: AthleteCancelChoice, current: AthleteCancelPolicy): AthleteCancelPolicy {
  if (choice === 'credit') return { mode: 'credit', refundPercent: 0 };
  if (choice === 'full') return { mode: 'refund', refundPercent: 100 };
  const keep = current.mode === 'refund' && current.refundPercent < 100 ? current.refundPercent : 50;
  return { mode: 'refund', refundPercent: keep };
}

/** O que o atleta lê antes de confirmar o cancelamento (mesmo texto do app). */
export function athleteCancelPolicyAthleteText(policy: AthleteCancelPolicy, arenaName: string): string {
  const name = arenaName.trim() || 'a arena';
  const head = `Cancelamento até ${ATHLETE_FREE_CANCEL_HOURS}h antes do horário: `;
  if (policy.mode === 'credit') {
    return `${head}o valor pago vira crédito para usar em outra reserva na ${name}.`;
  }
  if (policy.refundPercent >= 100) {
    return `${head}o valor pago pelo app volta inteiro, pelo mesmo meio (Pix ou cartão).`;
  }
  return `${head}${policy.refundPercent}% do valor pago volta pelo mesmo meio (Pix ou cartão); a ${name} fica com o resto.`;
}
