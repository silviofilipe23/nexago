/**
 * Varredura do prazo de garantia da vaga: inscrição que passou do
 * `holdExpiresAt` sem nenhum pagamento perde a vaga.
 *
 * A varredura é uma consulta só, por campo indexado automaticamente, sobre
 * TODOS os torneios — inscrição sem `holdExpiresAt` (anterior à regra, criada
 * pelo organizador, em fila de espera ou de torneio com o prazo desligado)
 * nunca aparece aqui.
 *
 * Cada inscrição é relida na hora de liberar: quem pagou no fio do prazo sai
 * da varredura com o campo limpo, em vez de perder a vaga por corrida.
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {asaasArenaSecrets} from "./asaas-client";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {
  deliverNotificationToUser,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {registrationHoldClearedFields} from "./tournament-registration-hold-ops";
import {
  registrationOwnerUid,
  shouldTrackRegistrationHold,
} from "./tournament-registration-hold";
import {releaseRegistration} from "./tournament-registration-release";

/** Teto por volta: 1 minuto de cadência dá vazão de sobra para o pico. */
const SWEEP_BATCH_SIZE = 50;

export const expirePendingTournamentRegistrations = onSchedule({
  schedule: "every 1 minutes",
  secrets: [
    ...asaasArenaSecrets,
    WEB_PUSH_PUBLIC_KEY,
    WEB_PUSH_PRIVATE_KEY,
    WEB_PUSH_SUBJECT,
  ],
}, async () => {
  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const now = Timestamp.now();

  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("holdExpiresAt", "<", now)
    .limit(SWEEP_BATCH_SIZE)
    .get();

  let released = 0;
  for (const doc of snap.docs) {
    try {
      const fresh = await doc.ref.get();
      if (!fresh.exists) continue;
      const registration = fresh.data() as Record<string, unknown>;

      const holdExpiresAt = registration.holdExpiresAt as Timestamp | undefined;
      if (
        !holdExpiresAt ||
        typeof holdExpiresAt.toMillis !== "function" ||
        holdExpiresAt.toMillis() > now.toMillis()
      ) {
        continue;
      }

      // Pagou (ou foi para a fila) entre a consulta e agora: a vaga é dela.
      if (!shouldTrackRegistrationHold(registration)) {
        await doc.ref.set(registrationHoldClearedFields(), {merge: true});
        continue;
      }

      const teamId = (registration.teamId as string | undefined)?.trim() ?? "";
      let team: Record<string, unknown> | null = null;
      if (teamId) {
        const teamSnap = await db
          .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
          .get();
        team = teamSnap.exists ?
          (teamSnap.data() as Record<string, unknown>) :
          null;
      }
      const athleteUids = registrationAthleteUids(registration, team);
      const ownerUid = registrationOwnerUid(registration);

      await releaseRegistration({
        db,
        projectId,
        registrationId: doc.id,
        registration,
        athleteUids,
        ownerUid,
        cancelledBy: "system",
        reason: "hold_expired",
      });
      released++;

      const tournamentId =
        (registration.tournamentId as string | undefined)?.trim() ?? "";
      await Promise.all(
        athleteUids.map((uid) =>
          deliverNotificationToUser({
            userId: uid,
            title: "Vaga liberada",
            body:
              "O prazo para concluir a inscrição acabou e sua vaga foi " +
              "liberada. Você pode se inscrever de novo enquanto houver vaga.",
            type: "tournament_registration_hold_expired",
            data: {tournamentId, url: `/torneios/${tournamentId}`},
          }).catch(() => undefined),
        ),
      );
    } catch (e) {
      // Asaas fora do ar ou escrita concorrente: a inscrição fica de pé e a
      // próxima volta tenta de novo.
      logger.error("Falha ao liberar inscrição vencida", {
        registrationId: doc.id,
        error: e,
      });
    }
  }

  // Loga toda volta, inclusive vazia: job agendado que só fala quando age é
  // indistinguível de job que parou de rodar.
  logger.info("Varredura de prazo de inscrição concluída", {
    candidates: snap.size,
    released,
  });
});
