import {getAuth} from "firebase-admin/auth";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore} from "firebase-admin/firestore";

import {hasRoleInClaims, callerIsOrganizer} from "./auth-roles";
import {getFirebaseProjectId} from "./firebase-paths";
import {
  deliverNotificationToUser,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";

/**
 * Envia notificação push para um usuário específico
 * Requer autenticação e permissão de admin
 */
export const sendNotification = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {userId, title, body, data, requireInteraction} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  // Verifica se o caller é admin ou arena (arena pode notificar atletas sobre cancelamento de reserva)
  const callerUser = await getAuth().getUser(callerUid);
  const cc = callerUser.customClaims;
  const canSend =
    hasRoleInClaims(cc, "admin") ||
    hasRoleInClaims(cc, "arena");

  if (!canSend) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins e gestores de arena podem enviar notificações");
  }

  if (!userId || !title || !body) {
    throw new HttpsError("invalid-argument", "Parâmetros inválidos: userId, title e body são obrigatórios");
  }

  try {
    const pushData = data ?
      Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) :
      {};
    const notificationType =
      typeof pushData.type === "string" ? pushData.type : "general";

    const delivery = await deliverNotificationToUser({
      userId,
      title,
      body,
      type: notificationType,
      data: pushData,
      requireInteraction: !!requireInteraction,
    });

    if (delivery.sent === 0 && delivery.failed === 0) {
      logger.warn(`Nenhum canal de push encontrado para o usuário ${userId}`);
      return {success: false, message: "Usuário não possui inscrições de push registradas"};
    }

    logger.info(`Notificação enviada para ${userId}: ${delivery.sent} sucesso, ${delivery.failed} falhas`);

    return {
      success: delivery.sent > 0,
      sent: delivery.sent,
      failed: delivery.failed,
      total: delivery.sent + delivery.failed,
    };
  } catch (error) {
    logger.error("Erro ao enviar notificação:", error);
    throw new Error("Erro ao enviar notificação");
  }
});

/**
 * Notifica o gestor da arena quando um atleta cria uma reserva.
 *
 * Segurança:
 * - Exige autenticação.
 * - Valida que o caller é o dono da reserva em `arenaBookings/{bookingId}`.
 * - Envia a notificação para `arenas/{arenaId}.managerUserId`.
 */
export const notifyArenaBookingCreated = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {bookingId} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!bookingId || typeof bookingId !== "string") {
    throw new HttpsError("invalid-argument", "Parâmetro inválido: bookingId é obrigatório");
  }

  const db = getFirestore();

  const bookingDoc = await db.collection("arenaBookings").doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingDoc.data() as {
    arenaId?: string;
    courtId?: string;
    athleteId?: string | null;
    date?: string;
    startTime?: string;
    endTime?: string;
  };

  const athleteId = typeof booking?.athleteId === "string" ? booking.athleteId : null;
  const arenaId = booking?.arenaId;

  if (!athleteId) {
    throw new HttpsError("failed-precondition", "Reserva não possui atleta associado");
  }

  if (athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o dono desta reserva");
  }

  if (!arenaId || typeof arenaId !== "string") {
    throw new HttpsError("failed-precondition", "Reserva não possui arenaId válido");
  }

  const arenaDoc = await db.collection("arenas").doc(arenaId).get();
  if (!arenaDoc.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }

  const arena = arenaDoc.data() as {
    name?: string;
    managerUserId?: string;
  };

  const arenaName = typeof arena?.name === "string" ? arena.name : "Arena";
  const arenaManagerUserId = typeof arena?.managerUserId === "string" ? arena.managerUserId : null;

  if (!arenaManagerUserId) {
    throw new HttpsError("failed-precondition", "Arena não possui managerUserId válido");
  }

  let formattedDate = typeof booking?.date === "string" ? booking.date : "";
  if (formattedDate) {
    const parsed = new Date(`${formattedDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      formattedDate = parsed.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  }

  const startTime = typeof booking?.startTime === "string" ? booking.startTime : "";
  const endTime = typeof booking?.endTime === "string" ? booking.endTime : "";

  const title = "Nova reserva";
  let courtName = "Quadra";
  const courtId = typeof booking?.courtId === "string" ? booking.courtId : "";
  if (courtId) {
    const courtDoc = await db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get();
    if (courtDoc.exists) {
      const court = courtDoc.data() as {name?: string};
      if (typeof court?.name === "string" && court.name.trim().length > 0) {
        courtName = court.name.trim();
      }
    }
  }
  const body = `Dia ${formattedDate} de  ${startTime} às ${endTime} na quadra ${courtName}.`;

  const notificationType = "arena_booking_created";
  const data: Record<string, string> = {
    type: notificationType,
    url: "/arena/calendar",
    athleteId,
    arenaName,
    date: typeof booking?.date === "string" ? booking.date : "",
    startTime,
    endTime,
  };

  const delivery = await deliverNotificationToUser({
    userId: arenaManagerUserId,
    title,
    body,
    type: notificationType,
    data,
    requireInteraction: true,
  });

  logger.info(
    `Notificação criada para ${arenaManagerUserId}: ${delivery.sent} sucesso, ${delivery.failed} falhas`
  );

  return {
    success: true,
    sent: delivery.sent,
    failed: delivery.failed,
    total: delivery.sent + delivery.failed,
  };
});

/**
 * Envia notificação para múltiplos usuários (ex: todos os participantes de um torneio)
 */
export const sendBulkNotification = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {userIds, title, body, data, requireInteraction} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new Error("Usuário não autenticado");
  }

  // Verifica se o caller é admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);

  if (!isAdmin) {
    throw new Error("Permissão negada: apenas admins podem enviar notificações");
  }

  if (!Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
    throw new Error("Parâmetros inválidos: userIds (array), title e body são obrigatórios");
  }

  try {
    const pushData = data ?
      Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) :
      {};
    const notificationType =
      typeof pushData.type === "string" ? pushData.type : "general";

    const results = await Promise.allSettled(
      userIds.map((userId: string) =>
        deliverNotificationToUser({
          userId,
          title,
          body,
          type: notificationType,
          data: pushData,
          requireInteraction: !!requireInteraction,
        })
      )
    );

    let sent = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        sent += result.value.sent;
        failed += result.value.failed;
      } else {
        failed += 1;
        logger.warn("sendBulkNotification: falha por usuário", result.reason);
      }
    }

    if (sent === 0 && failed === 0) {
      logger.warn("Nenhum canal de push encontrado para os usuários especificados");
      return {success: false, message: "Nenhuma inscrição de push encontrada"};
    }

    logger.info(`Notificação em massa enviada: ${sent} sucesso, ${failed} falhas`);

    return {
      success: sent > 0,
      sent,
      failed,
      total: userIds.length,
    };
  } catch (error) {
    logger.error("Erro ao enviar notificação em massa:", error);
    throw new Error("Erro ao enviar notificação em massa");
  }
});

/**
 * Cloud Function agendada para enviar lembretes de partidas
 * Executa a cada hora e verifica partidas que começam em 1 hora
 * 
 * Para ativar, configure no Firebase Console:
 * - Cloud Scheduler > Create Job
 * - Schedule: "0 * * * *" (a cada hora)
 * - Target: HTTP
 * - URL: https://us-central1-[PROJECT_ID].cloudfunctions.net/sendMatchReminders
 *   (Substitua [PROJECT_ID] pelo ID do projeto onde a função está deployada)
 */
export const sendMatchReminders = onRequest({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (req, res) => {
  try {
    const db = getFirestore();
    const projectId = getFirebaseProjectId();
    
    // Busca todas as partidas agendadas para as próximas 1-2 horas
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const matchesRef = db.collection(`artifacts/${projectId}/public/data/matches`);
    const matchesSnapshot = await matchesRef
      .where('status', '==', 'Scheduled')
      .where('scheduleTime', '>=', oneHourFromNow)
      .where('scheduleTime', '<=', twoHoursFromNow)
      .get();

    if (matchesSnapshot.empty) {
      logger.info('Nenhuma partida encontrada para lembrete');
      res.status(200).json({ success: true, sent: 0 });
      return;
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const matchDoc of matchesSnapshot.docs) {
      const match = matchDoc.data();
      const matchId = matchDoc.id;

      // Verifica se já foi enviado lembrete (usando campo sentReminder)
      if (match.sentReminder) {
        continue;
      }

      try {
        // Busca times
        const [teamA, teamB] = await Promise.all([
          db.doc(`artifacts/${projectId}/public/data/teams/${match.teamAId}`).get(),
          db.doc(`artifacts/${projectId}/public/data/teams/${match.teamBId}`).get()
        ]);

        const teamAData = teamA.data();
        const teamBData = teamB.data();

        if (!teamAData || !teamBData) {
          continue;
        }

        // Coleta userIds
        const userIds = new Set<string>();
        if (teamAData.player1Id) userIds.add(teamAData.player1Id);
        if (teamAData.player2Id) userIds.add(teamAData.player2Id);
        if (teamBData.player1Id) userIds.add(teamBData.player1Id);
        if (teamBData.player2Id) userIds.add(teamBData.player2Id);

        if (userIds.size === 0) {
          continue;
        }

        // Formata horário
        const scheduleTime = match.scheduleTime?.toDate() || new Date();
        const timeStr = scheduleTime.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        const teamAName = teamAData.teamName || 'Time A';
        const teamBName = teamBData.teamName || 'Time B';
        const courtName = match.courtName || 'Quadra';

        // Busca nome do torneio
        let tournamentName = 'Torneio';
        try {
          const tournamentDoc = await db.doc(`artifacts/${projectId}/public/data/tournaments/${match.tournamentId}`).get();
          if (tournamentDoc.exists) {
            const tournamentData = tournamentDoc.data();
            tournamentName = tournamentData?.['name'] || 'Torneio';
          }
        } catch (error) {
          logger.warn(`Erro ao buscar nome do torneio ${match.tournamentId}:`, error);
        }

        const title = '⏰ Lembrete: Partida em 1h';
        const pushBody = `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}`;
        const inboxBody = `${pushBody}\n${tournamentName}`;
        const reminderData = {
          matchId,
          tournamentId: String(match.tournamentId),
          categoryId: String(match.categoryId),
          hoursBefore: '1',
          url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`,
        };

        const deliveryResults = await Promise.allSettled(
          Array.from(userIds).map((userId) =>
            deliverNotificationToUser({
              userId,
              title,
              body: inboxBody,
              type: 'match_reminder',
              data: reminderData,
              requireInteraction: false,
            })
          )
        );

        for (const result of deliveryResults) {
          if (result.status === "fulfilled") {
            totalSent += result.value.sent;
            totalFailed += result.value.failed;
          } else {
            totalFailed += 1;
            logger.warn(`sendMatchReminders: falha para partida ${matchId}`, result.reason);
          }
        }

        // Marca que o lembrete foi enviado
        await matchDoc.ref.update({ sentReminder: true });

      } catch (error) {
        logger.error(`Erro ao processar partida ${matchId}:`, error);
        totalFailed++;
      }
    }

    logger.info(`Lembretes enviados: ${totalSent} sucesso, ${totalFailed} falhas`);
    res.status(200).json({ success: true, sent: totalSent, failed: totalFailed });
  } catch (error) {
    logger.error('Erro ao enviar lembretes:', error);
    res.status(500).json({ success: false, error: 'Erro ao enviar lembretes' });
  }
});