import { parseBrlToCents, centsToInput } from '../../retirada/retirada-format';
import type { Coupon, CouponType, ScopeType } from './coupon';

export interface CouponForm {
  code: string;
  type: CouponType;
  /** Texto do campo: "10" (%) ou "30,00" (R$). */
  value: string;
  max: string;
  scopeType: ScopeType;
  scopeIds: string[];
  scopeLabels: string[];
  minOrder: string;
  usageLimit: string;
  startDate: string;
  endDate: string;
  onePerAthlete: boolean;
  stacksWithPix: boolean;
  appOnly: boolean;
}

export interface CouponPayload {
  couponId?: string;
  code: string;
  type: CouponType;
  value: number;
  maxDiscountCents: number | null;
  scope: { type: ScopeType; ids: string[]; labels: string[] };
  minOrderCents: number | null;
  usageLimit: number | null;
  onePerAthlete: boolean;
  stacksWithPix: boolean;
  appOnly: boolean;
  startDate: string;
  endDate: string | null;
}

export type CouponFormErrors = Partial<Record<'code' | 'value' | 'max' | 'scope' | 'minOrder' | 'usageLimit' | 'endDate' | 'startDate', string>>;

export function emptyCouponForm(today: string): CouponForm {
  return {
    code: '',
    type: 'percent',
    value: '',
    max: '',
    scopeType: 'store',
    scopeIds: [],
    scopeLabels: [],
    minOrder: '',
    usageLimit: '',
    startDate: today,
    endDate: '',
    onePerAthlete: true,
    stacksWithPix: true,
    appOnly: false,
  };
}

export function formFromCoupon(c: Coupon): CouponForm {
  return {
    code: c.code,
    type: c.type,
    value: c.type === 'percent' ? String(c.value) : centsToInput(c.value),
    max: c.maxDiscountCents === null ? '' : centsToInput(c.maxDiscountCents),
    scopeType: c.scope.type,
    scopeIds: [...c.scope.ids],
    scopeLabels: [...c.scope.labels],
    minOrder: c.minOrderCents === null ? '' : centsToInput(c.minOrderCents),
    usageLimit: c.usageLimit === null ? '' : String(c.usageLimit),
    startDate: c.startDate,
    endDate: c.endDate ?? '',
    onePerAthlete: c.onePerAthlete,
    stacksWithPix: c.stacksWithPix,
    appOnly: c.appOnly,
  };
}

/** Duplicar = mesmo cupom com outro código, começando hoje e sem histórico. */
export function duplicateForm(c: Coupon, code: string, today: string): CouponForm {
  return { ...formFromCoupon(c), code, startDate: today, endDate: c.endDate && c.endDate >= today ? c.endDate : '' };
}

function optionalCents(text: string): number | null | 'invalid' {
  if (text.trim() === '') {
    return null;
  }
  const cents = parseBrlToCents(text);
  return cents === null || cents <= 0 ? 'invalid' : cents;
}

/** Mesmas regras da callable; aqui só para a mensagem aparecer no campo certo. */
export function validateCouponForm(
  f: CouponForm,
): { ok: true; payload: CouponPayload } | { ok: false; errors: CouponFormErrors } {
  const errors: CouponFormErrors = {};
  const code = f.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) {
    errors.code = 'Use de 4 a 20 letras ou números, sem espaço.';
  }

  let value = 0;
  if (f.type === 'percent') {
    value = Number(f.value.trim());
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      errors.value = 'De 1 a 100%.';
    }
  } else {
    value = parseBrlToCents(f.value) ?? 0;
    if (value <= 0) {
      errors.value = 'Informe um valor maior que zero.';
    }
  }

  const max = f.type === 'percent' ? optionalCents(f.max) : null;
  if (max === 'invalid') {
    errors.max = 'Valor inválido.';
  }
  const minOrder = optionalCents(f.minOrder);
  if (minOrder === 'invalid') {
    errors.minOrder = 'Valor inválido.';
  }
  let usageLimit: number | null = null;
  if (f.usageLimit.trim() !== '') {
    usageLimit = Number(f.usageLimit.trim());
    if (!Number.isInteger(usageLimit) || usageLimit < 1) {
      errors.usageLimit = 'Número inteiro maior que zero.';
    }
  }
  if (f.scopeType !== 'store' && f.scopeIds.length === 0) {
    errors.scope = 'Escolha para onde o cupom vale.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate)) {
    errors.startDate = 'Informe o início.';
  }
  if (f.endDate !== '' && f.endDate < f.startDate) {
    errors.endDate = 'O fim vem depois do início.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: {
      code,
      type: f.type,
      value,
      maxDiscountCents: max as number | null,
      scope: f.scopeType === 'store'
        ? { type: 'store', ids: [], labels: [] }
        : { type: f.scopeType, ids: f.scopeIds, labels: f.scopeLabels },
      minOrderCents: minOrder as number | null,
      usageLimit,
      onePerAthlete: f.onePerAthlete,
      stacksWithPix: f.stacksWithPix,
      appOnly: f.appOnly,
      startDate: f.startDate,
      endDate: f.endDate === '' ? null : f.endDate,
    },
  };
}
