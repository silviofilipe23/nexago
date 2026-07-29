import { httpsCallable, type Functions } from 'firebase/functions';
import type { ArenaCoupon } from './coupon.model';

/** Diferente de `promotions-repository.ts` (escrita direta no Firestore): cupons passam por
 *  Cloud Functions callable (mesmo padrão de `arena-wallet-repository.ts`), porque criar/desativar
 *  exige revalidar código único e resgates em transação server-side. */

export class ArenaCouponError extends Error {}

function mapFunctionsError(err: unknown): ArenaCouponError {
  const message = err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new ArenaCouponError(message);
}

export interface CreateArenaCouponInput {
  arenaId: string;
  code: string;
  discountPercent?: number | null;
  fixedDiscountReais?: number | null;
  /** ISO */
  validFrom?: string | null;
  /** ISO */
  validUntil?: string | null;
  maxRedemptionsTotal?: number | null;
  maxRedemptionsPerAthlete?: number;
}

export async function createArenaCoupon(functions: Functions, input: CreateArenaCouponInput): Promise<string> {
  const payload: Record<string, unknown> = {
    arenaId: input.arenaId,
    code: input.code,
    maxRedemptionsPerAthlete: input.maxRedemptionsPerAthlete ?? 1,
  };
  if (input.discountPercent != null) payload['discountPercent'] = input.discountPercent;
  if (input.fixedDiscountReais != null) payload['fixedDiscountReais'] = input.fixedDiscountReais;
  if (input.validFrom) payload['validFrom'] = input.validFrom;
  if (input.validUntil) payload['validUntil'] = input.validUntil;
  if (input.maxRedemptionsTotal != null) payload['maxRedemptionsTotal'] = input.maxRedemptionsTotal;

  try {
    const result = await httpsCallable<Record<string, unknown>, { couponId: string }>(functions, 'createArenaCoupon')(payload);
    return result.data.couponId;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function listArenaCoupons(functions: Functions, arenaId: string): Promise<ArenaCoupon[]> {
  try {
    const result = await httpsCallable<{ arenaId: string }, { coupons: ArenaCoupon[] }>(functions, 'listArenaCoupons')({ arenaId });
    return result.data.coupons ?? [];
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

/** Irreversível — reativar exige criar outro código. */
export async function deactivateArenaCoupon(functions: Functions, arenaId: string, couponId: string): Promise<void> {
  try {
    await httpsCallable<{ arenaId: string; couponId: string }, { success: boolean }>(functions, 'deactivateArenaCoupon')({
      arenaId,
      couponId,
    });
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
