/**
 * NexaSquad: teto do desconto do seguidor = a taxa da plataforma daquela cobrança.
 *
 * O desconto sai da taxa da nexaGO (o organizador recebe o mesmo líquido); sem teto, um desconto
 * maior que a taxa faria a nexaGO pagar do bolso. A taxa é a mesma que o webhook cobra no crédito
 * do organizador: a regra do torneio (`loadTournamentFeeRule`: exceção do torneio, comissão do
 * organizador ou padrão). Torneio sem organizador não credita carteira nenhuma — a receita inteira
 * é da plataforma —, então ali o teto é só o mínimo de cobrança (`null`).
 */
import type {Firestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {loadTournamentFeeRule, tournamentFeeReais, type FeeRule} from "./tournament-fees";
import {loadTournamentData} from "./tournament-registration-guards";

/** Regra da taxa do torneio (% e piso); `null` sem organizador. */
export async function tournamentFeeRule(
  db: Firestore,
  tournamentId: string,
  tournament: Record<string, unknown> | null | undefined,
): Promise<FeeRule | null> {
  const organizerId = typeof tournament?.["managerId"] === "string" ? tournament["managerId"].trim() : "";
  if (!organizerId) return null;
  const {percent, floorReais} = await loadTournamentFeeRule(db, tournamentId, organizerId, new Date());
  return {percent, floorReais};
}

/**
 * A mesma regra a partir da inscrição (para a prévia do checkout, que só conhece a inscrição).
 * O torneio sai da mesma cascata da cobrança (`loadTournamentData`: topo, senão o caminho legado),
 * ou a prévia de um torneio legado mostra o desconto sem teto e a cobrança aplica outro valor.
 */
export async function feeRuleForRegistration(db: Firestore, registrationId: string): Promise<FeeRule | null> {
  if (!registrationId) return null;
  const projectId = getFirebaseProjectId();
  const reg = (await db.collection(artifactsInscriptionsPath(projectId)).doc(registrationId).get()).data();
  const tournamentId = typeof reg?.["tournamentId"] === "string" ? reg["tournamentId"] : "";
  if (!tournamentId) return null;
  return tournamentFeeRule(db, tournamentId, await loadTournamentData(db, projectId, tournamentId));
}

/** Teto em centavos: a taxa da plataforma sobre o preço desta cobrança; `null` = sem teto de taxa. */
export function discountFeeCapCents(priceReais: number, rule: FeeRule | null): number | null {
  if (rule === null) return null;
  return Math.round(tournamentFeeReais(priceReais, rule) * 100);
}
