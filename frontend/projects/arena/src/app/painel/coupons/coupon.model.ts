/** Espelha `ArenaCouponDoc`/`serializeCoupon` (`functions/src/arena-coupons.ts`) — cupom é um
 *  CÓDIGO digitado pelo cliente (com validade e limite de uso), diferente de `ArenaPromotion`
 *  (desconto automático por quadra/dia/horário, sem código). Sem update: só criar/listar/desativar
 *  — desativar é irreversível (reativar exige criar outro código). */

export interface ArenaCoupon {
  id: string;
  code: string;
  active: boolean;
  discountPercent: number | null;
  fixedDiscountReais: number | null;
  /** ISO */
  validFrom: string | null;
  /** ISO */
  validUntil: string | null;
  maxRedemptionsTotal: number | null;
  maxRedemptionsPerAthlete: number;
  redemptionsCount: number;
}

export type CouponDisplayStatus = 'ativo' | 'agendado' | 'expirado' | 'inativo';

export const COUPON_STATUS_LABEL: Record<CouponDisplayStatus, string> = {
  ativo: 'Ativo',
  agendado: 'Agendado',
  expirado: 'Expirado',
  inativo: 'Desativado',
};

/** Deriva o status exibido na lista a partir de `active`/`validFrom`/`validUntil` — só `active`
 *  é persistido (mesmo padrão de `derivePromoStatus`). */
export function deriveCouponStatus(coupon: Pick<ArenaCoupon, 'active' | 'validFrom' | 'validUntil'>, now = new Date()): CouponDisplayStatus {
  if (!coupon.active) return 'inativo';
  if (coupon.validFrom && now < new Date(coupon.validFrom)) return 'agendado';
  if (coupon.validUntil && now > new Date(coupon.validUntil)) return 'expirado';
  return 'ativo';
}

export function formatCouponDiscount(coupon: Pick<ArenaCoupon, 'discountPercent' | 'fixedDiscountReais'>): string {
  if (coupon.fixedDiscountReais != null) {
    return `R$ ${coupon.fixedDiscountReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  if (coupon.discountPercent != null) {
    return `${coupon.discountPercent}%`;
  }
  return '—';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

export function formatCouponValidity(coupon: Pick<ArenaCoupon, 'validFrom' | 'validUntil'>): string {
  if (coupon.validFrom && coupon.validUntil) {
    return `${formatDate(coupon.validFrom)} – ${formatDate(coupon.validUntil)}`;
  }
  if (coupon.validFrom) return `A partir de ${formatDate(coupon.validFrom)}`;
  if (coupon.validUntil) return `Até ${formatDate(coupon.validUntil)}`;
  return 'Sem prazo definido';
}

export function formatCouponUsage(coupon: Pick<ArenaCoupon, 'redemptionsCount' | 'maxRedemptionsTotal'>): string {
  if (coupon.maxRedemptionsTotal != null) {
    return `${coupon.redemptionsCount} de ${coupon.maxRedemptionsTotal}`;
  }
  return `${coupon.redemptionsCount} (sem limite)`;
}

/** "YYYY-MM-DD" pra `<input type="date">`. */
export function isoToInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `<input type="date">` → ISO (meia-noite local) ou `null`. */
export function inputValueToIso(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toISOString();
}
