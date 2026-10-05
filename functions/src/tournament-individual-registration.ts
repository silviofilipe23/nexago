/**
 * Categoria individual (`teamSize: 1` explícito — multiesporte fase 4a).
 *
 * A inscrição nasce COMPLETA: `registerSoloTournament` cria uma equipe de um
 * atleta (o doc em `teams` é o que a chave, o ranking e a mesa já entendem) e a
 * inscrição com `teamId` e `partnerPending: false`. Não há parceiro: os
 * caminhos de convite recusam a categoria com mensagem própria.
 */
import {FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {INDIVIDUAL_TEAM_SIZE, isIndividualCategory} from "./tournament-team-category";

export const INDIVIDUAL_NO_PARTNER_MESSAGE =
  "Esta categoria é individual: a inscrição é só sua, sem parceiro.";

/** Doc da equipe de um atleta (mesmo formato da equipe nomeada, sem nome). */
export function individualTeamData(params: {
  uid: string;
  tournamentId: string;
  categoryId: string;
}): Record<string, unknown> {
  return {
    captainUid: params.uid,
    memberUids: [params.uid],
    teamSize: INDIVIDUAL_TEAM_SIZE,
    // Espelho legado (pôster, joins antigos): o segundo slot fica vazio.
    player1Id: params.uid,
    player2Id: "",
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Campos que fazem a inscrição individual entrar na chave como qualquer equipe. */
export function individualRegistrationFields(teamId: string): {
  teamId: string;
  teamSize: number;
  partnerPending: boolean;
} {
  return {teamId, teamSize: INDIVIDUAL_TEAM_SIZE, partnerPending: false};
}

/** Convite de parceiro (enviar, aceitar, externo) não existe em categoria individual. */
export function assertCategoryAcceptsPartner(
  category: Record<string, unknown> | null | undefined,
): void {
  if (isIndividualCategory(category)) {
    throw new HttpsError("failed-precondition", INDIVIDUAL_NO_PARTNER_MESSAGE);
  }
}
