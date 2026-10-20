import {
  PROFESSOR_TYPE_COPY,
  effectivePermissions,
  type ProfessorLink,
  type ProfessorTypeCopy,
} from '../professor/professor-links.model';

/** "Reservar como professor" aparece quando o vínculo do atleta com ESTA arena deixa agora
 *  (`ACTIVE` + "Reservar quadras"). A tela é só dica: quem decide é `createArenaBooking`
 *  (`asProfessor`), relendo o vínculo no servidor. Espelha `canOfferBookingAsProfessor` do app. */
export function professorBookingOption(
  links: readonly ProfessorLink[],
  arenaId: string,
): ProfessorTypeCopy | null {
  const link = links.find((l) => l.arenaId === arenaId);
  if (!link || !effectivePermissions(link).canBookCourts) return null;
  return PROFESSOR_TYPE_COPY[link.relationshipType];
}
