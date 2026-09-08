/**
 * Queimar o passe de vaga junto com a inscrição que ele autoriza.
 *
 * Mora fora de `tournament-spot-pass.ts` porque precisa do portão
 * (`resolveTournamentDocRef`, `categoryCapacityFullOf`) — e o portão importa o núcleo do passe.
 *
 * Em duas metades pelo mesmo motivo da vaga extra do organizador: o Firestore exige todas as
 * leituras antes de qualquer escrita numa transação. `readSpotPassClaimTx` entra junto das
 * outras leituras, `writeSpotPassClaimTx` junto das outras escritas. Ou nasce a inscrição com o
 * teto subido e o passe queimado, ou não nasce nada.
 */

import {HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import {artifactsInscriptionsPath} from "./firebase-paths";
import {categoryBracketPublished} from "./tournament-category-bracket-status";
import {
  planCategoryCapacityExpansion,
  planCategoryCapacityShrink,
  type CategoryCapacityExpansion,
} from "./tournament-category-capacity";
import {
  categoryCapacityFullOf,
  resolveCategoryMatchKeys,
  resolveTournamentDocRef,
  type TournamentData,
} from "./tournament-registration-guards";
import {
  REGISTRATION_SPOT_PASS_FIELD,
  SPOT_PASSES_COLLECTION,
  getActiveSpotPassRefTx,
  markSpotPassUsedTx,
  spotPassAnnotationOf,
  type SpotPassAnnotation,
  type SpotPassStatus,
} from "./tournament-spot-pass";

/** O que o portão viu, resolvido em documentos — pronto para entrar numa transação. */
export interface SpotPassClaim {
  annotation: SpotPassAnnotation;
  tournamentRef: DocumentReference;
  /** Ocupação medida pelo portão; a fila de espera não conta. */
  occupied: number;
}

/** Metade das leituras: o passe ainda vivo e o teto novo da categoria. */
export interface SpotPassClaimReads {
  passRef: DocumentReference;
  capacityPlan: CategoryCapacityExpansion | null;
}

export const SPOT_PASS_GONE_MESSAGE =
  "Esta vaga liberada não está mais disponível. Fale com o organizador.";

/**
 * Prepara a queima, ou `null` quando esta inscrição não veio de passe (o caso normal).
 *
 * Sem documento de torneio onde gravar o teto novo, recusa em vez de seguir: criar a inscrição
 * assim estouraria a categoria em silêncio.
 */
export async function prepareSpotPassClaim(params: {
  db: Firestore;
  projectId: string;
  tournamentId: string;
  tournament: TournamentData;
}): Promise<SpotPassClaim | null> {
  const {db, projectId, tournamentId, tournament} = params;

  const annotation = spotPassAnnotationOf(tournament);
  if (!annotation) return null;

  const full = categoryCapacityFullOf(tournament);
  const tournamentRef = await resolveTournamentDocRef(db, projectId, tournamentId);
  if (!tournamentRef || !full) {
    throw new HttpsError(
      "not-found",
      "Não foi possível abrir a vaga liberada: torneio não encontrado.",
    );
  }

  return {annotation, tournamentRef, occupied: full.occupied};
}

/**
 * Leituras da transação. Recusa quando o passe morreu entre o portão e a transação — outra
 * inscrição o queimou, ou o organizador revogou.
 *
 * `capacityPlan` nulo é desfecho normal: alguém pode ter cancelado uma inscrição nesse meio e
 * aberto uma vaga de verdade; aí o convidado ocupa a vaga que existe e o teto fica onde está.
 */
export async function readSpotPassClaimTx(
  tx: Transaction,
  db: Firestore,
  claim: SpotPassClaim | null,
): Promise<SpotPassClaimReads | null> {
  if (!claim) return null;

  const passRef = await getActiveSpotPassRefTx(tx, db, claim.annotation);
  if (!passRef) {
    throw new HttpsError("failed-precondition", SPOT_PASS_GONE_MESSAGE);
  }

  const snap = await tx.get(claim.tournamentRef);
  const capacityPlan = planCategoryCapacityExpansion({
    categories: snap.data()?.categories as unknown[] | undefined,
    categoryKey: claim.annotation.categoryId,
    occupied: claim.occupied,
  });

  return {passRef, capacityPlan};
}

/** Escritas da transação: teto novo no torneio, passe queimado. */
export function writeSpotPassClaimTx(
  tx: Transaction,
  claim: SpotPassClaim | null,
  reads: SpotPassClaimReads | null,
  registrationId: string,
): void {
  if (!claim || !reads) return;
  if (reads.capacityPlan) {
    tx.update(claim.tournamentRef, {categories: reads.capacityPlan.categories});
  }
  markSpotPassUsedTx(tx, reads.passRef, registrationId);
}

/**
 * Campo que a inscrição carrega quando nasceu de um passe.
 *
 * É por ele que a devolução da vaga acha o passe quando a inscrição morre sem pagar — sem esta
 * marca, o teto subido ficaria para sempre e a vaga nominal viraria vaga de todo mundo.
 */
export function spotPassRegistrationFields(
  claim: SpotPassClaim | null,
): Record<string, string> {
  return claim ? {[REGISTRATION_SPOT_PASS_FIELD]: claim.annotation.id} : {};
}

/**
 * Devolve a vaga que um passe tinha aberto, quando a inscrição do convidado morre.
 *
 * Chamada pelo `releaseRegistration` — logo, vale tanto para a varredura do prazo de garantia
 * quanto para o cancelamento pelo próprio atleta. É a metade que fecha o contrato do passe: sem
 * ela o teto subido ficaria de pé sem ninguém dentro, e a vaga nominal viraria vaga do primeiro
 * que chegasse, exatamente o oposto do pedido.
 *
 * O teto desce e o passe volta a `active`: a vaga continua sendo daquela pessoa, que pode
 * tentar de novo. Só o teto desce se a chave já saiu — passe morto não revive.
 *
 * Roda DEPOIS do delete da inscrição (a ocupação é recontada já sem ela) e é best-effort por
 * fora: um erro aqui não desfaz a liberação da vaga, só deixa o teto alto — e isso vira log.
 */
export async function restoreSpotPassSpot(params: {
  db: Firestore;
  projectId: string;
  registrationId: string;
  registration: Record<string, unknown>;
}): Promise<{shrunk: boolean; passRestored: boolean}> {
  const {db, projectId, registrationId, registration} = params;

  const passId = String(
    registration[REGISTRATION_SPOT_PASS_FIELD] ?? "",
  ).trim();
  const tournamentId = String(registration.tournamentId ?? "").trim();
  const categoryId = String(registration.categoryId ?? "").trim();
  if (!passId || !tournamentId || !categoryId) {
    return {shrunk: false, passRestored: false};
  }

  const tournamentRef = await resolveTournamentDocRef(db, projectId, tournamentId);
  if (!tournamentRef) return {shrunk: false, passRestored: false};

  const passRef = db.collection(SPOT_PASSES_COLLECTION).doc(passId);
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));

  return db.runTransaction(async (tx) => {
    const tournamentSnap = await tx.get(tournamentRef);
    const tournament = (tournamentSnap.data() ?? {}) as TournamentData;
    const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);
    const keys = [...categoryKeys].filter((k) => k.length > 0).slice(0, 10);
    if (keys.length === 0) return {shrunk: false, passRestored: false};

    const occupancySnap = await tx.get(
      inscriptionsRef
        .where("tournamentId", "==", tournamentId)
        .where("categoryId", "in", keys),
    );
    let occupied = 0;
    for (const doc of occupancySnap.docs) {
      if (doc.id === registrationId) continue; // ainda visível numa corrida com o delete
      if (doc.data()?.waitlist === true) continue;
      occupied++;
    }

    const passSnap = await tx.get(passRef);
    const passData = passSnap.data() ?? {};
    const passBelongsHere =
      passSnap.exists &&
      passData.status === "used" &&
      String(passData.usedRegistrationId ?? "").trim() === registrationId;

    const plan = planCategoryCapacityShrink({
      categories: tournament.categories as unknown[] | undefined,
      categoryKey: categoryId,
      occupied,
    });

    if (plan) {
      tx.update(tournamentRef, {categories: plan.categories});
    }

    // Chave publicada: a vaga volta para a categoria, mas o passe não ressuscita — ninguém
    // entra numa chave já montada.
    const canRestorePass =
      passBelongsHere && !categoryBracketPublished(tournament, categoryKeys);
    if (canRestorePass) {
      tx.update(passRef, {
        status: "active" satisfies SpotPassStatus,
        usedAt: FieldValue.delete(),
        usedRegistrationId: FieldValue.delete(),
        restoredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (passBelongsHere) {
      tx.update(passRef, {
        status: "expired" satisfies SpotPassStatus,
        expiredReason: "bracket_published",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {shrunk: plan != null, passRestored: canRestorePass};
  });
}
