/**
 * Link de vaga ao portador — o organizador manda UM link no grupo e as primeiras N pessoas que
 * resgatarem viram donas de uma vaga nominal.
 *
 * O id do doc **é** o token: id de doc do Firestore é aleatório e não adivinhável, mesmo
 * mecanismo do convite externo de parceiro.
 *
 * O resgate CRIA UM PASSE NOMINAL (`tournamentSpotPasses`) e não uma inscrição. É o que mantém
 * o link barato: daí para frente vale tudo o que já existe — o teto só sobe quando a pessoa se
 * inscrever, a devolução da vaga revive o passe, e a chave publicada mata os dois.
 *
 * Três mortes, todas checadas no resgate e nenhuma confiando só no campo `status`: contador
 * zerado, prazo vencido e chave publicada.
 *
 * O que este caminho NÃO afrouxa: nível, idade, categoria concluída e inscrição repetida. A
 * régua é a mesma da liberação nominal (`tournament-spot-pass-grant`) — de propósito, porque
 * duas cópias divergiriam e a divergência apareceria como "pelo link entrou quem pelo nome era
 * barrado". A diferença é só QUEM descobre: no nome, o organizador na hora; aqui, o atleta ao
 * abrir — então a recusa precisa dizer o motivo.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {getFirebaseProjectId} from "./firebase-paths";
import {assertCanManageTournament} from "./tournament-acl";
import {loadTournamentData} from "./tournament-registration-guards";
import {SPOT_PASSES_COLLECTION} from "./tournament-spot-pass";
import {
  assertAthleteCanReceiveSpotPass,
  assertCategoryAcceptsSpotPass,
  athleteDisplayName,
  buildSpotPassDoc,
  findActiveSpotPass,
  spotPassRegistrationUrl,
  trimmed,
} from "./tournament-spot-pass-grant";
import {PORTAL_CALLABLE_REGIONS} from "./function-regions";

export const SPOT_PASS_LINKS_COLLECTION = "tournamentSpotPassLinks";

export type SpotPassLinkStatus = "active" | "exhausted" | "revoked" | "expired";

/** Teto de vagas por link: acima disso não é "abrir vagas", é reabrir a categoria. */
export const MAX_LINK_SPOTS = 20;
/** Janela do prazo, em horas. O padrão curto é a válvula do link esquecido no grupo. */
export const DEFAULT_LINK_HOURS = 24;
export const MAX_LINK_HOURS = 7 * 24;

export const SPOT_PASS_LINK_GONE_MESSAGE =
  "Este link de vaga não está mais disponível.";

function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function isExpired(data: Record<string, unknown>, nowMs: number): boolean {
  const expiresAt = data.expiresAt;
  return expiresAt instanceof Timestamp && expiresAt.toMillis() <= nowMs;
}

/** Gera o link do grupo: N vagas, com prazo. */
export const organizerCreateSpotPassLink = onCall({
  region: PORTAL_CALLABLE_REGIONS,
}, async (request) => {
  const organizerUid = request.auth?.uid;
  if (!organizerUid) {
    throw new HttpsError("unauthenticated", "Login necessário");
  }

  const tournamentId = trimmed(request.data?.tournamentId);
  const categoryId = trimmed(request.data?.categoryId);
  if (!tournamentId || !categoryId) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId e categoryId são obrigatórios.",
    );
  }

  const spots = parsePositiveInt(request.data?.spots, 1);
  if (spots > MAX_LINK_SPOTS) {
    throw new HttpsError(
      "invalid-argument",
      `Um link abre no máximo ${MAX_LINK_SPOTS} vagas.`,
    );
  }
  const hours = parsePositiveInt(request.data?.expiresInHours, DEFAULT_LINK_HOURS);
  if (hours > MAX_LINK_HOURS) {
    throw new HttpsError(
      "invalid-argument",
      "O prazo do link é de no máximo 7 dias.",
    );
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  await assertCanManageTournament(db, organizerUid, tournamentId);

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const {categoryLabel} = assertCategoryAcceptsSpotPass(tournament, categoryId);

  const ref = db.collection(SPOT_PASS_LINKS_COLLECTION).doc();
  await ref.set({
    tournamentId,
    tournamentName: trimmed(tournament.name) || "Torneio",
    categoryId,
    categoryLabel,
    total: spots,
    remaining: spots,
    claimedByUids: [],
    status: "active" satisfies SpotPassLinkStatus,
    expiresAt: Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000),
    createdByUid: organizerUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("Link de vaga criado", {
    linkId: ref.id,
    tournamentId,
    categoryId,
    spots,
    hours,
    organizerUid,
  });

  return {linkId: ref.id, spots, expiresInHours: hours};
});

/** Revoga o link. As vagas JÁ resgatadas continuam de pé — elas viraram passes nominais. */
export const organizerRevokeSpotPassLink = onCall({
  region: PORTAL_CALLABLE_REGIONS,
}, async (request) => {
  const organizerUid = request.auth?.uid;
  if (!organizerUid) {
    throw new HttpsError("unauthenticated", "Login necessário");
  }
  const linkId = trimmed(request.data?.linkId);
  if (!linkId) {
    throw new HttpsError("invalid-argument", "linkId é obrigatório.");
  }

  const db = getFirestore();
  const ref = db.collection(SPOT_PASS_LINKS_COLLECTION).doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Link não encontrado.");
  }
  const data = snap.data() ?? {};

  await assertCanManageTournament(db, organizerUid, trimmed(data.tournamentId));

  if (data.status !== "active") {
    throw new HttpsError("failed-precondition", "Este link não está mais ativo.");
  }

  await ref.update({
    status: "revoked" satisfies SpotPassLinkStatus,
    revokedAt: FieldValue.serverTimestamp(),
    revokedByUid: organizerUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("Link de vaga revogado", {linkId, organizerUid});
  return {ok: true};
});

/**
 * O atleta resgata uma vaga do link.
 *
 * As validações caras (perfil, nível, idade, inscrição repetida) rodam FORA da transação; a
 * transação faz só o que precisa ser atômico: reler o contador, criar o passe e descontar. Dois
 * atletas na última vaga se serializam ali — o segundo relê `remaining: 0` e é recusado.
 */
export const claimSpotPassLink = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para pegar a vaga.");
  }
  const linkId = trimmed(request.data?.linkId);
  if (!linkId) {
    throw new HttpsError("invalid-argument", "linkId é obrigatório.");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const linkRef = db.collection(SPOT_PASS_LINKS_COLLECTION).doc(linkId);

  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) {
    throw new HttpsError("not-found", SPOT_PASS_LINK_GONE_MESSAGE);
  }
  const link = linkSnap.data() ?? {};
  const tournamentId = trimmed(link.tournamentId);
  const categoryId = trimmed(link.categoryId);

  if (link.status === "revoked") {
    throw new HttpsError("failed-precondition", "Este link foi cancelado pelo organizador.");
  }
  // Esgotado é o desfecho MAIS COMUM de um link que circulou, e merece a própria frase: quem
  // chega atrasado precisa saber que perdeu a vaga, não que "o link não está disponível".
  if (link.status === "exhausted" || Number(link.remaining ?? 0) <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "As vagas deste link acabaram. Fale com o organizador.",
    );
  }
  if (isExpired(link, Date.now())) {
    throw new HttpsError(
      "failed-precondition",
      "O prazo deste link acabou. Peça um novo ao organizador.",
    );
  }

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  // Chave publicada e categoria concluída matam o link mesmo com `status: active` gravado.
  const {category, categoryKeys, categoryLabel} = assertCategoryAcceptsSpotPass(
    tournament,
    categoryId,
  );

  // Reentrada: quem já pegou a vaga e abre o link de novo recebe o passe que já tem, sem
  // gastar outra. Sem isto, tocar duas vezes no link do WhatsApp comeria duas vagas.
  const existing = await findActiveSpotPass({
    db,
    tournamentId,
    categoryKeys,
    athleteUid: uid,
  });
  if (existing) {
    return {
      passId: existing.id,
      tournamentId,
      categoryId,
      categoryLabel,
      url: spotPassRegistrationUrl(tournamentId, categoryId),
      alreadyClaimed: true,
    };
  }

  const athlete = await assertAthleteCanReceiveSpotPass({
    db,
    projectId,
    tournament,
    category,
    tournamentId,
    categoryKeys,
    athleteUid: uid,
    alreadyRegisteredMessage: "Você já tem inscrição nesta categoria.",
  });

  const passRef = db.collection(SPOT_PASSES_COLLECTION).doc();

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(linkRef);
    const data = fresh.data() ?? {};
    const remaining = typeof data.remaining === "number" ? data.remaining : 0;
    const claimed = Array.isArray(data.claimedByUids) ?
      (data.claimedByUids as unknown[]).map((v) => String(v)) :
      [];

    // A ordem repete a de fora: a corrida na última vaga é o caso que esta releitura existe
    // para pegar, e ela precisa contar a mesma história para quem perdeu.
    if (remaining <= 0 || data.status === "exhausted") {
      throw new HttpsError(
        "failed-precondition",
        "As vagas deste link acabaram. Fale com o organizador.",
      );
    }
    if (data.status !== "active" || isExpired(data, Date.now())) {
      throw new HttpsError("failed-precondition", SPOT_PASS_LINK_GONE_MESSAGE);
    }
    if (claimed.includes(uid)) {
      // Corrida do próprio atleta (dois toques): a releitura na transação é o que impede a
      // segunda de gastar uma vaga.
      throw new HttpsError("failed-precondition", "Você já pegou uma vaga deste link.");
    }

    tx.set(
      passRef,
      buildSpotPassDoc({
        tournamentId,
        categoryId,
        categoryLabel,
        athleteUid: uid,
        athleteName: athleteDisplayName(athlete),
        grantedByUid: trimmed(data.createdByUid),
        linkId,
      }),
    );
    tx.update(linkRef, {
      remaining: remaining - 1,
      claimedByUids: FieldValue.arrayUnion(uid),
      ...(remaining - 1 <= 0 ?
        {status: "exhausted" satisfies SpotPassLinkStatus} :
        {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  logger.info("Vaga resgatada por link", {linkId, passId: passRef.id, uid, tournamentId});

  return {
    passId: passRef.id,
    tournamentId,
    categoryId,
    categoryLabel,
    url: spotPassRegistrationUrl(tournamentId, categoryId),
    alreadyClaimed: false,
  };
});

