/**
 * A régua compartilhada de quem pode RECEBER um passe de vaga, e o formato do passe.
 *
 * Existe porque o passe nasce por dois caminhos — o organizador liberando nominalmente
 * (`tournament-spot-pass-ops`) e o atleta resgatando um link do grupo
 * (`tournament-spot-pass-link`) — e as duas validações precisam ser a MESMA. Duas cópias
 * divergiriam no primeiro ajuste, e a divergência apareceria como "pelo link entrou quem pelo
 * nome era barrado".
 *
 * O que a régua NÃO decide: quem pode LIBERAR (isso é ACL do organizador, e o link não tem
 * dono no momento do resgate).
 */

import {HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";

import {loadUserAccessData} from "./athlete-tournament-access";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {artifactsInscriptionsPath} from "./firebase-paths";
import {categoryBracketPublished} from "./tournament-category-bracket-status";
import {
  findCategory,
  resolveCategoryLabel,
  resolveCategoryMatchKeys,
  type TournamentData,
} from "./tournament-registration-guards";
import {SPOT_PASSES_COLLECTION, type SpotPassStatus} from "./tournament-spot-pass";

export function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Nome do atleta para a lista do organizador — retrato, não fonte da verdade. */
export function athleteDisplayName(
  userData: Record<string, unknown> | null,
): string {
  return (
    trimmed(userData?.["fullName"]) ||
    trimmed(userData?.["name"]) ||
    trimmed(userData?.["displayName"]) ||
    "Atleta"
  );
}

/** Categoria aberta a passes, com as chaves equivalentes já resolvidas. */
export interface SpotPassCategory {
  category: Record<string, unknown>;
  categoryKeys: Set<string>;
  categoryLabel: string;
}

/**
 * A categoria existe e ainda aceita passe?
 *
 * Recusa em dois estados, e os dois valem tanto para liberar quanto para resgatar: categoria
 * concluída e chave publicada. Lotação NÃO entra — é justamente o que o passe existe para
 * atravessar.
 */
export function assertCategoryAcceptsSpotPass(
  tournament: TournamentData,
  categoryId: string,
): SpotPassCategory {
  const category = findCategory(tournament, categoryId);
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada.");
  }
  if (category.isCompleted === true) {
    throw new HttpsError("failed-precondition", "Categoria já concluída.");
  }
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);
  if (categoryBracketPublished(tournament, categoryKeys)) {
    throw new HttpsError(
      "failed-precondition",
      "As chaves desta categoria já foram publicadas — não há mais vaga a liberar.",
    );
  }
  return {
    category,
    categoryKeys,
    categoryLabel: resolveCategoryLabel(tournament, categoryId),
  };
}

/** O atleta já ocupa (ou disputa) vaga nesta categoria? Aí o passe não teria o que abrir. */
export async function alreadyInCategory(params: {
  db: Firestore;
  projectId: string;
  tournamentId: string;
  categoryKeys: Set<string>;
  athleteUid: string;
}): Promise<boolean> {
  const {db, projectId, tournamentId, categoryKeys, athleteUid} = params;
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("participantUids", "array-contains", athleteUid)
    .get();
  return snap.docs.some((doc) =>
    categoryKeys.has(trimmed(doc.data()?.categoryId)),
  );
}

/** Passe vivo deste atleta nesta categoria, ou `null`. */
export async function findActiveSpotPass(params: {
  db: Firestore;
  tournamentId: string;
  categoryKeys: Set<string>;
  athleteUid: string;
}): Promise<DocumentReference | null> {
  const {db, tournamentId, categoryKeys, athleteUid} = params;
  const snap = await db
    .collection(SPOT_PASSES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "active")
    .where("athleteUid", "==", athleteUid)
    .get();
  const live = snap.docs.find((doc) =>
    categoryKeys.has(trimmed(doc.data()?.categoryId)),
  );
  return live?.ref ?? null;
}

/**
 * Tudo o que o atleta encontraria na inscrição, checado ANTES de o passe existir.
 *
 * Liberar (ou resgatar) uma vaga para quem o anti-sandbagging vai barrar três telas adiante é
 * entregar um passe que é mentira. Devolve o retrato do atleta para o nome do passe.
 */
export async function assertAthleteCanReceiveSpotPass(params: {
  db: Firestore;
  projectId: string;
  tournament: TournamentData;
  category: Record<string, unknown>;
  tournamentId: string;
  categoryKeys: Set<string>;
  athleteUid: string;
  /** Mensagem de "já inscrito" — o organizador fala de "este atleta", o link fala com ele. */
  alreadyRegisteredMessage: string;
}): Promise<Record<string, unknown>> {
  const {db, projectId, tournament, category, tournamentId, categoryKeys, athleteUid} =
    params;

  const athlete = await loadUserAccessData(db, athleteUid);
  if (athlete == null) {
    throw new HttpsError("not-found", "Atleta não encontrado.");
  }

  if (await alreadyInCategory({db, projectId, tournamentId, categoryKeys, athleteUid})) {
    throw new HttpsError("failed-precondition", params.alreadyRegisteredMessage);
  }

  await assertTeamLevelEligibility({db, tournament, category, uids: [athleteUid]});
  await assertTeamAgeEligibility({db, tournament, category, uids: [athleteUid]});

  return athlete as Record<string, unknown>;
}

/** O documento do passe, no formato único das duas origens. */
export function buildSpotPassDoc(params: {
  tournamentId: string;
  categoryId: string;
  categoryLabel: string;
  athleteUid: string;
  athleteName: string;
  grantedByUid: string;
  /** Token do link que gerou este passe; ausente quando o organizador liberou pelo nome. */
  linkId?: string;
}): Record<string, unknown> {
  return {
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    categoryLabel: params.categoryLabel,
    athleteUid: params.athleteUid,
    athleteName: params.athleteName,
    status: "active" satisfies SpotPassStatus,
    grantedByUid: params.grantedByUid,
    ...(params.linkId ? {linkId: params.linkId} : {}),
    grantedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Destino do push e do link: o fluxo normal de inscrição, já na categoria certa. */
export function spotPassRegistrationUrl(
  tournamentId: string,
  categoryId: string,
): string {
  return (
    `/torneios/${tournamentId}/inscricao` +
    `?categoryId=${encodeURIComponent(categoryId)}`
  );
}
