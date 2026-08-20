import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  assertCanRegisterInTournament,
  loadUserAccessData,
} from "./athlete-tournament-access";
import {getFirebaseProjectId} from "./firebase-paths";
import {sendPartnerInviteFor} from "./tournament-partner-invite";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  loadTournamentData,
} from "./tournament-registration-guards";

/**
 * Convite de dupla/equipe para parceiro que **ainda não tem conta**.
 *
 * O convite real (`tournamentRegistrationInvites`) exige um `inviteeUid`, que
 * não existe antes do cadastro. Então quem convida cria aqui um convite
 * EXTERNO — um token de uso único — e compartilha o link. Quem abre instala o
 * app, se cadastra e, ao fim do onboarding, o app resgata o token: aí sim o
 * convite de verdade nasce, já com o uid recém-criado, e a tela do convite
 * abre para o atleta aceitar.
 *
 * O id do doc **é** o token: id de doc do Firestore é aleatório e não
 * adivinhável. As travas são uso único e expiração — quem receber o link
 * encaminhado e resgatar primeiro vira o convidado, e por isso o convite
 * continua exigindo aceite e podendo ser cancelado por quem convidou.
 */
export const EXTERNAL_INVITES_COLLECTION = "tournamentExternalPartnerInvites";

/** Mesma janela do convite normal. */
const EXTERNAL_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ExternalInviteStatus = "pending" | "claiming" | "claimed" | "cancelled";

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isExpired(data: Record<string, unknown>, nowMs: number): boolean {
  const expiresAt = data.expiresAt;
  if (expiresAt instanceof Timestamp) return expiresAt.toMillis() <= nowMs;
  return false;
}

async function inviterDisplayName(db: Firestore, uid: string): Promise<string> {
  try {
    const data = await loadUserAccessData(db, uid);
    const raw = data as Record<string, unknown> | null;
    const name = trimmed(raw?.["fullName"]) || trimmed(raw?.["name"]);
    return name || "Atleta";
  } catch {
    // Nome é enfeite da mensagem; não vale derrubar a criação do convite.
    return "Atleta";
  }
}

/**
 * Cria o token e devolve o id para montar o link.
 *
 * Valida o mesmo que o envio normal valida do lado de quem convida: perfil
 * apto e torneio/categoria aceitando inscrição. O que depende do convidado
 * (gênero, nível, idade) só dá para checar no resgate — o atleta ainda nem
 * existe.
 */
export const createExternalPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const tournamentId = trimmed(request.data?.tournamentId);
  const categoryId = trimmed(request.data?.categoryId);
  const inviteeName = trimmed(request.data?.inviteeName).slice(0, 60);
  if (!tournamentId || !categoryId) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId e categoryId são obrigatórios.",
    );
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  await assertCanRegisterInTournament(db, uid);
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (!findCategory(tournament, categoryId)) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }

  const now = Date.now();
  const ref = db.collection(EXTERNAL_INVITES_COLLECTION).doc();
  await ref.set({
    tournamentId,
    categoryId,
    inviterUid: uid,
    inviterName: await inviterDisplayName(db, uid),
    ...(inviteeName ? {inviteeName} : {}),
    status: "pending" satisfies ExternalInviteStatus,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + EXTERNAL_INVITE_TTL_MS),
  });

  logger.info("External partner invite created", {
    externalInviteId: ref.id,
    tournamentId,
    categoryId,
    inviterUid: uid,
  });

  return {externalInviteId: ref.id};
});

/**
 * Resgata o token e cria o convite de verdade em nome de quem compartilhou.
 *
 * O uso único é garantido na transação (`pending` → `claiming`), antes de
 * qualquer escrita fora dela: dois resgates simultâneos, só um passa. Se a
 * criação do convite for recusada pelas validações (gênero incompatível,
 * categoria lotada, atleta já inscrito), o token **volta para `pending`** — a
 * recusa é do convidado específico, não do link.
 *
 * Idempotente: resgatar de novo o mesmo token, pelo mesmo atleta, devolve o
 * convite já criado em vez de erro — o app pode reentrar na tela.
 */
export const claimExternalPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  const externalInviteId = trimmed(request.data?.externalInviteId);
  if (!externalInviteId) {
    throw new HttpsError("invalid-argument", "externalInviteId é obrigatório.");
  }

  const db = getFirestore();
  const ref = db.collection(EXTERNAL_INVITES_COLLECTION).doc(externalInviteId);

  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Convite não encontrado.");
    }
    const data = snap.data() as Record<string, unknown>;
    const status = trimmed(data.status) as ExternalInviteStatus;
    const inviterUid = trimmed(data.inviterUid);

    if (inviterUid === uid) {
      throw new HttpsError(
        "failed-precondition",
        "Este é o seu próprio link de convite.",
      );
    }
    if (status === "cancelled") {
      throw new HttpsError("failed-precondition", "Este convite foi cancelado.");
    }
    if (isExpired(data, Date.now())) {
      throw new HttpsError(
        "failed-precondition",
        "Este convite expirou. Peça um novo para quem te chamou.",
      );
    }
    if (status === "claimed") {
      // Já resgatado: pelo mesmo atleta é reentrada (devolve o convite);
      // por outro, o link acabou.
      if (trimmed(data.claimedByUid) === uid) {
        return {alreadyClaimedInviteId: trimmed(data.inviteId), data};
      }
      throw new HttpsError(
        "failed-precondition",
        "Este convite já foi usado por outro atleta.",
      );
    }
    if (status === "claiming" && trimmed(data.claimedByUid) !== uid) {
      throw new HttpsError(
        "failed-precondition",
        "Este convite já está sendo usado por outro atleta.",
      );
    }

    tx.update(ref, {
      status: "claiming" satisfies ExternalInviteStatus,
      claimedByUid: uid,
      claimedAt: FieldValue.serverTimestamp(),
    });
    return {alreadyClaimedInviteId: "", data};
  });

  if (claim.alreadyClaimedInviteId) {
    return {
      inviteId: claim.alreadyClaimedInviteId,
      tournamentId: trimmed(claim.data.tournamentId),
      categoryId: trimmed(claim.data.categoryId),
    };
  }

  const tournamentId = trimmed(claim.data.tournamentId);
  const categoryId = trimmed(claim.data.categoryId);
  const inviterUid = trimmed(claim.data.inviterUid);

  try {
    const result = await sendPartnerInviteFor({
      uid: inviterUid,
      tournamentId,
      categoryId,
      inviteeUid: uid,
      inviteeName: await inviterDisplayName(db, uid),
      inviterName: trimmed(claim.data.inviterName) || "Atleta",
    });
    await ref.update({
      status: "claimed" satisfies ExternalInviteStatus,
      inviteId: result.inviteId,
    });
    logger.info("External partner invite claimed", {
      externalInviteId,
      inviteId: result.inviteId,
      inviterUid,
      inviteeUid: uid,
    });
    return {inviteId: result.inviteId, tournamentId, categoryId};
  } catch (error) {
    // A recusa é deste convidado, não do link: devolve o token para quem
    // convidou poder mandar para outra pessoa.
    await ref.update({
      status: "pending" satisfies ExternalInviteStatus,
      claimedByUid: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
    });
    logger.warn("External partner invite claim failed", {
      externalInviteId,
      inviteeUid: uid,
      error,
    });
    throw error;
  }
});
