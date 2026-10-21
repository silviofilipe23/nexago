import { courtDiscountRuleLabel, effectivePermissions, type CourtDiscountWindow, type ProfessorLink } from '../professor/professor-links.model';

/**
 * Vínculo do professor logado com ESTA arena quando ele deixa reservar como professor agora
 * (`ACTIVE` + "Reservar quadras"). `null` esconde a opção e a tela de pagamento fica como sempre.
 * A tela é só dica: quem decide é `createArenaBooking` (`asProfessor`), relendo o vínculo.
 * Mesma régua do app (`canOfferBookingAsProfessor`).
 */
export function bookingProfessorLink(links: readonly ProfessorLink[], arenaId: string): ProfessorLink | null {
  if (!arenaId) return null;
  return links.find((l) => l.arenaId === arenaId && effectivePermissions(l).canBookCourts) ?? null;
}

/** "A Arena Sol vê na agenda que o horário é seu como professor. Mesmo preço e regras." — com
 *  desconto no vínculo, o preço muda: "… Desconto de professor de 20% (não soma com promoção ou cupom)."
 *  Com faixa: "… de 20% das 08:00 às 17:00 (…)" — só os horários inteiros dentro dela. */
export function bookingAsProfessorHint(
  arenaName: string | null | undefined,
  discountPercent = 0,
  discountWindow: CourtDiscountWindow | null = null,
): string {
  const name = arenaName?.trim();
  const who = `${name ? `A ${name}` : 'A arena'} vê na agenda que o horário é seu como professor.`;
  return discountPercent > 0
    ? `${who} Desconto de professor de ${courtDiscountRuleLabel(discountPercent, discountWindow)} (não soma com promoção ou cupom).`
    : `${who} Mesmo preço e regras.`;
}

/** Linha do resumo: "Desconto de professor (20%)". */
export function professorDiscountSummaryLabel(percent: number): string {
  return percent > 0 ? `Desconto de professor (${percent}%)` : 'Desconto de professor';
}
