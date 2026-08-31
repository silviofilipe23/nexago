/**
 * Escrita do prazo de garantia (`holdExpiresAt`) na inscrição.
 *
 * Uma função só recalcula o prazo a partir do estado atual — elenco e convites
 * vivos — e é chamada depois de todo evento que muda esse estado (convite
 * enviado, aceito, recusado, cancelado; integrante que sai; promoção da fila).
 * Chamar de novo com o mesmo estado dá o mesmo resultado, então repetir é
 * inofensivo.
 *
 * Nada aqui derruba a ação do atleta: o prazo é ajuste de segundo plano, e
 * falha dele vira log, não erro na tela.
 */

import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {artifactsInscriptionsPath} from "./firebase-paths";
import {
  INVITES_COLLECTION,
  inviteExpiresAtMs,
  inviteIsLive,
} from "./tournament-invite-constants";
import {inviteMatchesCancelledRegistration} from
  "./tournament-registration-cancellation";
import {loadTournamentData} from "./tournament-registration-guards";
import {
  computeRegistrationHoldExpiryMs,
  extendHoldForPixMs,
  registrationOwnerUid,
  resolveRegistrationHoldMinutes,
  shouldTrackRegistrationHold,
} from "./tournament-registration-hold";

/**
 * Campos de prazo para a CRIAÇÃO da inscrição, quando ainda não há convite
 * ligado a ela. Devolve `{}` — inscrição imune — para fila de espera e para
 * torneio com o prazo desligado.
 */
export function registrationHoldFieldsOnCreate(params: {
  tournament: Record<string, unknown> | null | undefined;
  waitlist?: boolean;
  nowMs?: number;
}): Record<string, unknown> {
  if (params.waitlist === true) return {};
  const holdMinutes = resolveRegistrationHoldMinutes(params.tournament);
  if (holdMinutes == null) return {};
  const nowMs = params.nowMs ?? Date.now();
  return {
    holdExpiresAt: Timestamp.fromMillis(
      computeRegistrationHoldExpiryMs({nowMs, holdMinutes}),
    ),
  };
}

/** Campo que tira a inscrição da varredura — a vaga passa a ser dela. */
export function registrationHoldClearedFields(): Record<string, unknown> {
  return {holdExpiresAt: FieldValue.delete()};
}

/**
 * Recalcula o prazo da inscrição. Enquanto há convite pendente vivo ligado a
 * ela, o prazo acompanha o convite mais longe; sem convite vivo, os minutos de
 * garantia contam de agora.
 */
export async function refreshRegistrationHold(
  db: Firestore,
  projectId: string,
  registrationId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const id = registrationId.trim();
  if (!id) return;
  try {
    const regRef = db
      .collection(artifactsInscriptionsPath(projectId))
      .doc(id);
    const regSnap = await regRef.get();
    if (!regSnap.exists) return;
    const registration = regSnap.data() as Record<string, unknown>;

    if (!shouldTrackRegistrationHold(registration)) {
      if (registration.holdExpiresAt !== undefined) {
        await regRef.set(registrationHoldClearedFields(), {merge: true});
      }
      return;
    }

    const tournamentId =
      (registration.tournamentId as string | undefined)?.trim() ?? "";
    const tournament = tournamentId ?
      await loadTournamentData(db, projectId, tournamentId) :
      null;
    const holdMinutes = resolveRegistrationHoldMinutes(tournament);
    if (holdMinutes == null) {
      if (registration.holdExpiresAt !== undefined) {
        await regRef.set(registrationHoldClearedFields(), {merge: true});
      }
      return;
    }

    const liveInviteExpiresAtMs = await latestLiveInviteExpiryMs({
      db,
      registrationId: id,
      registration,
      tournamentId,
      nowMs,
    });

    await regRef.set({
      holdExpiresAt: Timestamp.fromMillis(
        computeRegistrationHoldExpiryMs({
          nowMs,
          holdMinutes,
          liveInviteExpiresAtMs,
        }),
      ),
    }, {merge: true});
  } catch (e) {
    logger.warn("Falha ao recalcular prazo da inscrição", {
      registrationId: id,
      error: e,
    });
  }
}

/**
 * Vencimento do convite vivo mais longe que segura esta vaga. Vale o mesmo
 * casamento usado ao liberar a vaga (anexado por id, ou avulso do dono na
 * categoria), para que o prazo cubra exatamente os convites que morreriam com
 * a inscrição. Convite de substituição fica de fora: ele não segura elenco.
 */
async function latestLiveInviteExpiryMs(params: {
  db: Firestore;
  registrationId: string;
  registration: Record<string, unknown>;
  tournamentId: string;
  nowMs: number;
}): Promise<number | null> {
  const {db, registration, tournamentId, nowMs} = params;
  if (!tournamentId) return null;
  const categoryId =
    (registration.categoryId as string | undefined)?.trim() ?? "";
  const ownerUid = registrationOwnerUid(registration);

  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();

  let latest: number | null = null;
  for (const doc of snap.docs) {
    const invite = doc.data();
    if (invite.isSubstitutionInvite === true) continue;
    if (!inviteIsLive(invite, nowMs)) continue;
    if (!inviteMatchesCancelledRegistration(invite, {
      registrationId: params.registrationId,
      cancellerUid: ownerUid,
      categoryId,
    })) {
      continue;
    }
    const expiry = inviteExpiresAtMs(invite);
    if (expiry != null && (latest == null || expiry > latest)) latest = expiry;
  }
  return latest;
}

/**
 * Empurra o prazo para cobrir uma cobrança PIX recém-criada: o sweeper nunca
 * mata cobrança viva.
 */
export async function extendRegistrationHoldForPix(
  db: Firestore,
  projectId: string,
  registrationId: string,
  pixExpiresAt: Date,
): Promise<void> {
  const id = registrationId.trim();
  if (!id) return;
  try {
    const regRef = db
      .collection(artifactsInscriptionsPath(projectId))
      .doc(id);
    const regSnap = await regRef.get();
    if (!regSnap.exists) return;
    const current = regSnap.data()?.holdExpiresAt as Timestamp | undefined;
    // Sem prazo a inscrição é imune (antiga, do organizador ou fila): a
    // cobrança não pode criar um prazo onde não havia.
    if (!current || typeof current.toMillis !== "function") return;
    const next = extendHoldForPixMs(current.toMillis(), pixExpiresAt.getTime());
    if (next <= current.toMillis()) return;
    await regRef.set(
      {holdExpiresAt: Timestamp.fromMillis(next)},
      {merge: true},
    );
  } catch (e) {
    logger.warn("Falha ao esticar prazo da inscrição pelo PIX", {
      registrationId: id,
      error: e,
    });
  }
}
