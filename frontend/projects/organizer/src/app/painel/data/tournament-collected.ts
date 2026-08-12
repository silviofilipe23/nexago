import type { TournamentPaymentMode } from './tournament-create.model';

/** Recorte da arrecadação de um torneio, lido de `tournaments/{id}`.
 *
 *  Quem grava é a Cloud Function `tournament-collected-stats.ts`, a cada escrita de inscrição.
 *  A regra de canal é POR INSCRIÇÃO (`paymentMethod === 'organizer_direct'` → por fora; senão
 *  `paidAmount > 0` → plataforma), e não pelo `paymentMode` do torneio — é o que faz a baixa
 *  manual num torneio "pelo app" cair no balde certo.
 *
 *  `toVerifyCents` é um SUBCONJUNTO de `viaOrganizerCents` (declarado sem baixa), não uma
 *  terceira parcela: `totalCents === viaAppCents + viaOrganizerCents`. */
export interface TournamentCollected {
  totalCents: number;
  viaAppCents: number;
  viaOrganizerCents: number;
  toVerifyCents: number;
  /** Doc anterior ao recorte: os campos por canal não existem e o total foi atribuído inteiro ao
   *  canal que o `paymentMode` do wizard indica. O número total continua exato — só a divisão é
   *  suposta, e erra justamente quando houve baixa manual em torneio "pelo app". */
  estimated: boolean;
}

export const EMPTY_TOURNAMENT_COLLECTED: TournamentCollected = {
  totalCents: 0,
  viaAppCents: 0,
  viaOrganizerCents: 0,
  toVerifyCents: 0,
  estimated: false,
};

/** `null` = campo AUSENTE (doc anterior ao recorte), que é diferente de zero — é essa distinção
 *  que decide entre ler o recorte real e cair no fallback pelo `paymentMode`. */
function centsOf(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.round(v));
}

export function collectedFromDoc(data: Record<string, unknown>, paymentMode: TournamentPaymentMode): TournamentCollected {
  const viaAppCents = centsOf(data['collectedViaAppCents']);
  const viaOrganizerCents = centsOf(data['collectedViaOrganizerCents']);

  if (viaAppCents == null || viaOrganizerCents == null) {
    const totalCents = centsOf(data['collectedCents']) ?? 0;
    const direct = paymentMode === 'directWithOrganizer';
    return {
      totalCents,
      viaAppCents: direct ? 0 : totalCents,
      viaOrganizerCents: direct ? totalCents : 0,
      // Sem o recorte não dá pra saber o que foi conferido; declarar "a conferir" aqui seria
      // inventar uma fila que ninguém mediu.
      toVerifyCents: 0,
      estimated: true,
    };
  }

  return {
    // Somado, e não lido de `collectedCents`, pra garantir que os dois valores exibidos sempre
    // fechem com o total — mesmo se uma escrita parcial deixar os campos fora de sincronia.
    totalCents: viaAppCents + viaOrganizerCents,
    viaAppCents,
    viaOrganizerCents,
    toVerifyCents: Math.min(centsOf(data['collectedToVerifyCents']) ?? 0, viaOrganizerCents),
    estimated: false,
  };
}

/** Soma o recorte de vários torneios. `estimated` contamina o agregado: basta um torneio sem o
 *  recorte real pra que a divisão do total não seja mais confiável. */
export function sumCollected(items: readonly TournamentCollected[]): TournamentCollected {
  return items.reduce<TournamentCollected>(
    (acc, c) => ({
      totalCents: acc.totalCents + c.totalCents,
      viaAppCents: acc.viaAppCents + c.viaAppCents,
      viaOrganizerCents: acc.viaOrganizerCents + c.viaOrganizerCents,
      toVerifyCents: acc.toVerifyCents + c.toVerifyCents,
      estimated: acc.estimated || c.estimated,
    }),
    EMPTY_TOURNAMENT_COLLECTED,
  );
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL_CENTS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor cheio (com centavos) — telas de detalhe financeiro. */
export function formatCents(cents: number): string {
  return BRL_CENTS.format(cents / 100);
}

/** Valor redondo — KPIs e cards, onde os centavos só poluem. */
export function formatCentsShort(cents: number): string {
  return BRL.format(cents / 100);
}
