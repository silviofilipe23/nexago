import type { ArenaBookingPaymentMode } from '../data/arena-bookings-repository';

export type PixBookingCreateOptions = {
  clientAmountReais: number;
  paymentMode: ArenaBookingPaymentMode;
  paymentFraction: number;
  couponCode?: string;
};

/** Opções de `createArenaBooking` para reserva paga por PIX — as MESMAS para "Gerar PIX" e
 *  "Dividir com amigos". Quando cada caminho montava a sua, a divisão esqueceu o cupom: a reserva
 *  nascia sem desconto e a soma das fatias (feita sobre o total com desconto) não batia. */
export function pixBookingCreateOptions(input: {
  totalPriceReais: number;
  pixFraction: number;
  couponCode: string | null;
}): PixBookingCreateOptions {
  return {
    clientAmountReais: input.totalPriceReais,
    paymentMode: 'pix',
    paymentFraction: input.pixFraction,
    ...(input.couponCode ? { couponCode: input.couponCode } : {}),
  };
}
