import { effectivePermissions, type ProfessorLink } from '../professor/professor-links.model';

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

/** "A Arena Sol vê na agenda que o horário é seu como professor. Mesmo preço e regras." */
export function bookingAsProfessorHint(arenaName: string | null | undefined): string {
  const name = arenaName?.trim();
  return `${name ? `A ${name}` : 'A arena'} vê na agenda que o horário é seu como professor. Mesmo preço e regras.`;
}
