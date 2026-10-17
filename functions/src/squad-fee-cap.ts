/**
 * NexaSquad: teto do desconto do seguidor = a taxa da plataforma daquela cobrança.
 *
 * O desconto sai da taxa da nexaGO (o organizador recebe o mesmo líquido); sem teto, um desconto
 * maior que a taxa faria a nexaGO pagar do bolso. A taxa é a mesma que o webhook cobra no crédito
 * do organizador: `computePlatformFeeReais(preço, % do organizador)`. Torneio sem organizador não
 * credita carteira nenhuma — a receita inteira é da plataforma —, então ali o teto é só o mínimo
 * de cobrança (`null`).
 */
import type {Firestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {computePlatformFeeReais, resolveOrganizerTournamentFeePercent} from "./platform-fees";

/** % da taxa do torneio (negociado no cadastro do organizador, senão o padrão); `null` sem organizador. */
export async function tournamentFeePercent(
  db: Firestore,
  tournament: Record<string, unknown> | null | undefined,
): Promise<number | null> {
  const organizerId = typeof tournament?.["managerId"] === "string" ? tournament["managerId"].trim() : "";
  if (!organizerId) return null;
  return resolveOrganizerTournamentFeePercent((await db.doc(`organizers/${organizerId}`).get()).data());
}

/** O mesmo % a partir da inscrição (para a prévia do checkout, que só conhece a inscrição). */
export async function feePercentForRegistration(db: Firestore, registrationId: string): Promise<number | null> {
  if (!registrationId) return null;
  const reg = (await db.collection(artifactsInscriptionsPath(getFirebaseProjectId())).doc(registrationId).get()).data();
  const tournamentId = typeof reg?.["tournamentId"] === "string" ? reg["tournamentId"] : "";
  if (!tournamentId) return null;
  return tournamentFeePercent(db, (await db.doc(`tournaments/${tournamentId}`).get()).data());
}

/** Teto em centavos: a taxa da plataforma sobre o preço desta cobrança; `null` = sem teto de taxa. */
export function discountFeeCapCents(priceReais: number, feePercent: number | null): number | null {
  if (feePercent === null) return null;
  return Math.round(computePlatformFeeReais(priceReais, feePercent) * 100);
}
