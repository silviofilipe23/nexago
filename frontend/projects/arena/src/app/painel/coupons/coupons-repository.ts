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

export interface ArenaCouponTermsInput {
  arenaId: string;
  discountPercent?: number | null;
  fixedDiscountReais?: number | null;
  /** ISO */
  validFrom?: string | null;
  /** ISO */
  validUntil?: string | null;
  maxRedemptionsTotal?: number | null;
  maxRedemptionsPerAthlete?: number;
}

export interface CreateArenaCouponInput extends ArenaCouponTermsInput {
  code: string;
}

export interface UpdateArenaCouponInput extends ArenaCouponTermsInput {
  couponId: string;
}

function termsPayload(input: ArenaCouponTermsInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    arenaId: input.arenaId,
    maxRedemptionsPerAthlete: input.maxRedemptionsPerAthlete ?? 1,
  };
  if (input.discountPercent != null) payload['discountPercent'] = input.discountPercent;
  if (input.fixedDiscountReais != null) payload['fixedDiscountReais'] = input.fixedDiscountReais;
  if (input.validFrom) payload['validFrom'] = input.validFrom;
  if (input.validUntil) payload['validUntil'] = input.validUntil;
  if (input.maxRedemptionsTotal != null) payload['maxRedemptionsTotal'] = input.maxRedemptionsTotal;
  return payload;
}

export async function createArenaCoupon(functions: Functions, input: CreateArenaCouponInput): Promise<string> {
  const payload = { ...termsPayload(input), code: input.code };
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

/** O payload é o estado final das condições: campos opcionais omitidos são removidos no servidor.
 *  O código não muda (é o id do cupom). */
export async function updateArenaCoupon(functions: Functions, input: UpdateArenaCouponInput): Promise<void> {
  const payload = { ...termsPayload(input), couponId: input.couponId };
  try {
    await httpsCallable<Record<string, unknown>, { success: boolean }>(functions, 'updateArenaCoupon')(payload);
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
