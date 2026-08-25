import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {MatchStatus, isMatchCompleted, isMatchInProgress} from "./match-status";
import {
  buildDoubleEliminationMatches,
  buildGroupsKnockoutMatches,
  buildSingleEliminationMatches,
  isBalancedQualifierTotal,
} from "./category-bracket-builders";
import {BRACKET_DEFINITIONS} from "./bracket-definitions/bracket-definitions";
import {assertCanManageTournament} from "./tournament-acl";
import {
  ORGANIZER_DIRECT_PAYMENT_METHOD,
  organizerDirectConfirmPaidAmount,
} from "./organizer-category-ops-payments";
import {
  PAYMENT_REVERT_BLOCK_MESSAGE,
  PAYMENT_SNAPSHOT_FIELD,
  buildPaymentRevertNotificationBody,
  buildPaymentRevertPlan,
  paymentRevertBlock,
  paymentSnapshotOf,
  shouldCapturePaymentSnapshot,
} from "./organizer-payment-revert";
import {
  loadTournamentData,
  resolveCategoryEntryFee,
} from "./tournament-registration-guards";
import {
  canCancelTournament,
  countPaidRegistrations,
  paidTeamIdsForCancellation,
} from "./tournament-cancellation";
import {
  registrationAthleteUids,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import {
  buildRemovalNotificationBody,
  parseRemovalDescription,
} from "./organizer-removal-description";
import {buildRegistrationCancellationAudit} from "./tournament-registration-cancellation";
import {organizerContactFromUser} from "./tournament-contacts";
import {notifyBracketPublishedAthletes} from "./organizer-category-ops-bracket-notify";
import {artifactsInscriptionsPath, artifactsMatchesPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";





function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

export const generateCategoryBracket = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  const categoryId = (request.data?.categoryId as string)?.trim();
  const format = (request.data?.format as string)?.trim() || "groups_knockout";
  if (!tournamentId || !categoryId) {
    throw new HttpsError("invalid-argument", "tournamentId e categoryId obrigatórios");
  }

  const supportedBracketFormats = new Set([
    "groups_knockout",
    "single_elimination",
    "double_elimination",
  ]);
  if (!supportedBracketFormats.has(format)) {
    throw new HttpsError(
      "failed-precondition",
      `Formato "${format}" ainda não é suportado para geração de chave.`,
    );
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  await assertCanManageTournament(db, uid, tournamentId);

  const seeds = (request.data?.seeds as string[] | undefined) ?? [];
  const groupsPreview =
    (request.data?.groupsPreview as Array<{id: string; teamIds: string[]}> | undefined) ??
    [];
  const bracketConfig = request.data?.bracketConfig as Record<string, unknown> | undefined;

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const tournamentData = tournamentSnap.data() ?? {};
  const categories =
    (tournamentData.categories as Array<Record<string, unknown>> | undefined) ?? [];
  const categoryMeta = categories.find(
    (entry) => String(entry.categoryName ?? "").trim() === categoryId,
  );
  const qualifiersPerGroup =
    (bracketConfig?.qualifiersPerGroup as number | undefined) ??
    (categoryMeta?.qualifiersPerGroup as number | undefined) ??
    2;

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const paidTeamIds = new Set<string>();
  for (const doc of inscriptionsSnap.docs) {
    const data = doc.data();
    const teamId = (data.teamId as string)?.trim();
    // "Confirmado" no NexaGO = pago, fora da fila e com dupla completa.
    // Inscrições solo (partnerPending) não entram na chave.
    if (
      teamId &&
      data.isPaid === true &&
      data.waitlist !== true &&
      data.partnerPending !== true
    ) {
      paidTeamIds.add(teamId);
    }
  }

  const teamIds: string[] = [];
  if (seeds.length > 0) {
    for (const seed of seeds) {
      const id = seed.trim();
      if (id && paidTeamIds.has(id)) teamIds.push(id);
    }
    // Duplas pagas fora da lista de seeds (ex.: pagamento confirmado depois do
    // carregamento da tela, ou ordem de cabeças salva antes de novas inscrições)
    // entram no FIM da ordem — antes eram simplesmente descartadas da chave.
    const seeded = new Set(teamIds);
    for (const id of paidTeamIds) {
      if (!seeded.has(id)) teamIds.push(id);
    }
  } else {
    teamIds.push(...paidTeamIds);
  }

  if (teamIds.length < 2) {
    throw new HttpsError(
      "failed-precondition",
      "É necessário ao menos 2 equipes pagas para publicar a chave.",
    );
  }

  // Dupla eliminação usa plantas de chave validadas (4–27 duplas). Fora dessa
  // faixa não há chave garantida, então bloqueia em vez de publicar uma chave
  // quebrada (o gerador algorítmico não resolve byes fora de potências de 2).
  if (format === "double_elimination" && !BRACKET_DEFINITIONS[teamIds.length]) {
    const supported = Object.keys(BRACKET_DEFINITIONS)
      .map(Number)
      .sort((a, b) => a - b);
    const min = supported[0];
    const max = supported[supported.length - 1];
    throw new HttpsError(
      "failed-precondition",
      `Dupla eliminação está disponível para ${min} a ${max} duplas ` +
        `(há ${teamIds.length}). Use grupos + mata-mata ou eliminatória ` +
        "simples para esta quantidade.",
      {reason: "de_unsupported_team_count", teamCount: teamIds.length, min, max},
    );
  }

  const existingMatches = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  // Regerar a chave APAGA as partidas existentes. Se alguma já foi jogada
  // (em andamento/concluída ou com vencedor), exige confirmação explícita
  // (`force`) para não perder resultados silenciosamente.
  const force = request.data?.force === true;
  if (!force) {
    const hasPlayedMatches = existingMatches.docs.some((doc) => {
      const m = doc.data();
      const winnerId = typeof m.winnerId === "string" ? m.winnerId.trim() : "";
      return (
        isMatchCompleted(m.status) ||
        isMatchInProgress(m.status) ||
        winnerId.length > 0
      );
    });
    if (hasPlayedMatches) {
      throw new HttpsError(
        "failed-precondition",
        "A chave já tem partidas em andamento ou concluídas. " +
          "Regerar vai apagar os resultados atuais.",
        {reason: "bracket_has_results"},
      );
    }
  }

  const resolvedGroups =
    groupsPreview.length > 0
      ? groupsPreview
      : [
          {id: "A", teamIds: teamIds.slice(0, Math.ceil(teamIds.length / 2))},
          {id: "B", teamIds: teamIds.slice(Math.ceil(teamIds.length / 2))},
        ];

  // Grupos + mata-mata: o nº total de classificados precisa formar um chaveamento
  // limpo (2, 4, 8, 16… classificados). Senão o mata-mata fica com partidas vazias
  // ou classificado sem confronto (totais ímpares como 3 e 5 passavam no teste
  // antigo de `total >> 1` e publicavam chave quebrada).
  if (format === "groups_knockout") {
    // Os grupos do preview são a fonte dos jogos de grupo e da classificação —
    // precisam bater EXATAMENTE com as duplas elegíveis: dupla não paga/na fila
    // não pode entrar na chave via preview, e dupla paga não pode sumir por o
    // preview ter sido montado antes de uma confirmação de pagamento.
    if (groupsPreview.length > 0) {
      const previewIds = resolvedGroups.flatMap((g) =>
        g.teamIds.map((id) => id.trim()).filter((id) => id.length > 0),
      );
      const previewSet = new Set(previewIds);
      if (previewSet.size !== previewIds.length) {
        throw new HttpsError(
          "failed-precondition",
          "Há dupla repetida na prévia de grupos. Sorteie os grupos novamente.",
          {reason: "groups_preview_duplicate"},
        );
      }
      const teamIdSet = new Set(teamIds);
      const stale =
        previewSet.size !== teamIdSet.size ||
        [...previewSet].some((id) => !teamIdSet.has(id));
      if (stale) {
        throw new HttpsError(
          "failed-precondition",
          "As inscrições confirmadas mudaram desde o sorteio dos grupos. " +
            "Recarregue a página e sorteie novamente.",
          {reason: "groups_preview_stale"},
        );
      }
    }
    const tooFewTeams = resolvedGroups.find(
      (g) => g.teamIds.filter((id) => id.trim()).length < qualifiersPerGroup,
    );
    if (tooFewTeams) {
      throw new HttpsError(
        "failed-precondition",
        `O grupo ${tooFewTeams.id} tem menos duplas do que os ` +
          `${qualifiersPerGroup} classificados configurados.`,
        {reason: "group_too_small"},
      );
    }
    const totalQualifiers = resolvedGroups.length * qualifiersPerGroup;
    if (!isBalancedQualifierTotal(totalQualifiers)) {
      throw new HttpsError(
        "failed-precondition",
        `${totalQualifiers} classificados (${resolvedGroups.length} grupos × ` +
          `${qualifiersPerGroup}) não formam um mata-mata equilibrado. Ajuste o ` +
          "número de grupos ou de classificados (totais como 2, 4, 8 ou 16).",
        {reason: "knockout_not_balanced", totalQualifiers},
      );
    }
  }

  const matchDrafts =
    format === "double_elimination"
      ? buildDoubleEliminationMatches(teamIds)
      : format === "single_elimination"
        ? buildSingleEliminationMatches(teamIds)
        : buildGroupsKnockoutMatches(
            teamIds,
            resolvedGroups,
            qualifiersPerGroup,
          );

  const batch = db.batch();
  const matchesCol = db.collection(artifactsMatchesPath(projectId));

  for (const doc of existingMatches.docs) {
    batch.delete(doc.ref);
  }

  for (const draft of matchDrafts) {
    const ref = matchesCol.doc();
    batch.set(ref, {
      tournamentId,
      categoryId,
      round: draft.round,
      matchType: draft.matchType,
      poolId: draft.poolId,
      teamAId: draft.teamAId,
      teamBId: draft.teamBId,
      status: MatchStatus.scheduled,
      resultA: "",
      resultB: "",
      isGroupMatch: draft.isGroupMatch,
      matchNumber: draft.matchNumber,
      ...(draft.winnerAdvance ? {winnerAdvance: draft.winnerAdvance} : {}),
      ...(draft.loserAdvance ? {loserAdvance: draft.loserAdvance} : {}),
      ...(draft.teamAQualifier ? {teamAQualifier: draft.teamAQualifier} : {}),
      ...(draft.teamBQualifier ? {teamBQualifier: draft.teamBQualifier} : {}),
      ...(draft.teamADescription ? {teamADescription: draft.teamADescription} : {}),
      ...(draft.teamBDescription ? {teamBDescription: draft.teamBDescription} : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
  batch.set(
    tournamentRef,
    {
      categoryOps: {
        [categoryId]: {
          bracketStatus: "published",
          bracketFormatOverride: format,
          seeds: teamIds,
          bracketConfig: {
            ...(bracketConfig ?? {}),
            qualifiersPerGroup,
          },
          groupsPreview: resolvedGroups,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  await batch.commit();

  try {
    const categoryLabel = String(
      categoryMeta?.label ?? categoryMeta?.categoryName ?? categoryId,
    ).trim();
    await notifyBracketPublishedAthletes({
      db,
      projectId,
      tournamentId,
      categoryId,
      categoryLabel: categoryLabel || categoryId,
      format,
      teamIds,
      teamsPath: (teamId) => `${artifactsTeamsPath(projectId)}/${teamId}`,
    });
  } catch (e) {
    logger.warn("generateCategoryBracket: falha ao notificar atletas", {
      tournamentId,
      categoryId,
      e,
    });
  }

  return {matchCount: matchDrafts.length, format};
});

export const organizerConfirmRegistrationPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const data = snap.data()!;
  const tournamentId = (data.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  const categoryId = (data.categoryId as string | undefined)?.trim() ?? "";
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  const entryFee = categoryId
    ? resolveCategoryEntryFee(tournament, categoryId)
    : 0;
  const paidAmount = organizerDirectConfirmPaidAmount(entryFee);

  await assertCanManageTournament(db, uid, tournamentId);
  await ref.update({
    isPaid: true,
    // Ao confirmar o pagamento, o time deixa de ser "fila".
    waitlist: false,
    paidAmount: paidAmount ?? FieldValue.delete(),
    paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
    paidAt: FieldValue.serverTimestamp(),
    // Dá baixa no selo "A conferir" das inscrições em que os atletas declararam o pagamento
    // direto (`declaredPaidAt`). Confirmar é justamente o ato de dizer "o dinheiro caiu".
    paymentVerifiedByOrganizer: true,
    paymentVerifiedAt: FieldValue.serverTimestamp(),
    paymentVerifiedByUid: uid,
    // Retrato do estado ANTES da baixa: é o que
    // `organizerRevertRegistrationPayment` usa para desfazer exatamente esta
    // escrita (parcela já paga pelo app, fila de espera, declaração do atleta)
    // em vez de jogar a inscrição num "pendente" genérico.
    ...(shouldCapturePaymentSnapshot(data) ?
      {[PAYMENT_SNAPSHOT_FIELD]: paymentSnapshotOf(data)} :
      {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Solo que pagou o total e ainda não tem parceiro: avisa para convidar
  // (o parceiro entra sem taxa) com deep link para o passo de parceiro.
  if (data.partnerPending === true) {
    try {
      const teamId = (data.teamId as string | undefined)?.trim() ?? "";
      const reservedUids = new Set<string>();
      if (teamId) {
        const teamSnap = await db
          .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
          .get();
        const team = teamSnap.data() ?? {};
        const memberUids = Array.isArray(team.memberUids) ? team.memberUids : [];
        for (const id of [...memberUids, team.player1Id, team.player2Id]) {
          if (typeof id === "string" && id.trim()) reservedUids.add(id.trim());
        }
      } else {
        // Solo novo (sem equipe): notifica o atleta da inscrição.
        const p1 = (data.player1Id as string | undefined)?.trim() ?? "";
        if (p1) reservedUids.add(p1);
      }
      const categoryId = (data.categoryId as string | undefined)?.trim() ?? "";
      const url =
        `/torneios/${tournamentId}/inscricao?registrationId=${registrationId}` +
        `&step=partner${categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : ""}`;
      await Promise.all(
        [...reservedUids].map((athleteUid) =>
          deliverNotificationToUser({
            userId: athleteUid,
            title: "Pagamento confirmado",
            body: "Vaga garantida! Convide seu parceiro — ele entra sem taxa.",
            type: "tournament_registration_partner_pending",
            data: {tournamentId, registrationId, url},
          }).catch(() => undefined),
        ),
      );
    } catch (notifyError) {
      logger.warn("Falha ao notificar convite de parceiro pós-confirmação", {
        registrationId,
        notifyError,
      });
    }
  }

  return {ok: true};
});

/**
 * Desfaz a baixa manual de pagamento — o organizador confirmou na dupla errada
 * e precisa voltar atrás.
 *
 * Só reverte o que ele mesmo lançou (`paymentMethod: organizer_direct`):
 * pagamento recebido pela plataforma tem dinheiro real do outro lado e sai por
 * estorno, não por edição de doc. A inscrição volta ao estado guardado na
 * confirmação (`paymentBeforeConfirm`) — pendente, "A conferir" ou fila —, e a
 * vaga NÃO é liberada: quem tira a dupla da categoria é a remoção.
 */
export const organizerRevertRegistrationPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const data = snap.data() ?? {};
  const tournamentId = (data.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);

  const block = paymentRevertBlock(data);
  if (block) {
    throw new HttpsError(
      "failed-precondition",
      PAYMENT_REVERT_BLOCK_MESSAGE[block],
    );
  }

  const plan = buildPaymentRevertPlan(data);
  await ref.update({
    ...plan.set,
    ...Object.fromEntries(
      plan.clear.map((field) => [field, FieldValue.delete()]),
    ),
    // Rastro de quem desfez: a inscrição continua viva, então cabe no próprio
    // doc (a remoção, que deleta, é que precisa de coleção de auditoria).
    paymentRevertedAt: FieldValue.serverTimestamp(),
    paymentRevertedByUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // O atleta viu "Pago" e a inscrição volta a não paga: sem aviso ele só
  // descobre por acaso, abrindo o app.
  try {
    const teamId = (data.teamId as string | undefined)?.trim() ?? "";
    const teamSnap = teamId ?
      await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get() :
      null;
    const athleteUids = registrationAthleteUids(
      data,
      teamSnap?.exists ? teamSnap.data() : null,
    );
    const tournament = await loadTournamentData(db, projectId, tournamentId);
    const body = buildPaymentRevertNotificationBody({
      tournamentName: String(tournament?.name ?? ""),
      outcome: plan.outcome,
    });
    await Promise.all(
      athleteUids.map((athleteUid) =>
        deliverNotificationToUser({
          userId: athleteUid,
          title: "Pagamento revertido",
          body,
          type: "tournament_payment_reverted",
          data: {
            tournamentId,
            registrationId,
            url: `/torneios/${tournamentId}`,
          },
        }).catch(() => undefined),
      ),
    );
  } catch (notifyError) {
    logger.warn("Falha ao notificar reversão de pagamento", {
      registrationId,
      notifyError,
    });
  }

  logger.info("Organizer reverted registration payment", {
    registrationId,
    tournamentId,
    uid,
    outcome: plan.outcome,
  });

  return {ok: true, outcome: plan.outcome};
});

export const organizerMoveToWaitlist = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const tournamentId = (snap.data()?.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);
  await ref.update({
    waitlist: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true};
});

export const organizerRemoveFromCategory = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const data = snap.data() ?? {};
  const tournamentId = (data.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);

  // Obrigatório: a inscrição é deletada logo abaixo, então este texto é a única
  // explicação que o atleta vai receber por perder a vaga.
  const description = parseRemovalDescription(request.data?.description);
  if (!description.ok) {
    throw new HttpsError("invalid-argument", description.message);
  }

  // Inscrição paga (inclui solo que pagou o total): registra/avisa reembolso.
  // Não há estorno automático — o organizador devolve manualmente o valor pago.
  const paidAmount = Number(data.paidAmount) || 0;
  const wasPaid = data.isPaid === true || paidAmount > 0;
  const refundAmount = paidAmount;

  const teamId = (data.teamId as string | undefined)?.trim() ?? "";
  const teamSnap = teamId
    ? await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get()
    : null;
  // Inscrição sem `teamId` (solo novo) também tem atleta pra avisar: o helper
  // cai em player1Id/participantUids, coisa que a leitura só do team não fazia.
  const athleteUids = registrationAthleteUids(
    data,
    teamSnap?.exists ? teamSnap.data() : null,
  );

  // Contato do organizador vai junto na notificação: a inscrição morre aqui, e
  // com ela o acesso do atleta a `getTournamentOrganizerContact` (que exige
  // inscrição ativa). Sem isso ele lê o motivo e não tem a quem responder.
  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const managerId = String(tournamentSnap.data()?.managerId ?? "").trim();
  const organizerContact = managerId
    ? organizerContactFromUser((await db.doc(`users/${managerId}`).get()).data() ?? {})
    : null;

  // Auditoria antes do delete: sem ela a remoção pelo organizador não deixaria
  // rastro nenhum. Mesma coleção do "aprovar pedido de cancelamento".
  const batch = db.batch();
  const auditRef = db.collection("tournamentRegistrationCancellations").doc();
  batch.set(auditRef, {
    ...buildRegistrationCancellationAudit({
      registrationId,
      cancelledBy: uid,
      athleteUids,
      registration: data,
    }),
    cancelledAt: FieldValue.serverTimestamp(),
    removedByOrganizer: true,
    removalDescription: description.value,
  });
  batch.delete(ref);
  await batch.commit();

  await Promise.all(
    athleteUids.map((athleteUid) =>
      deliverNotificationToUser({
        userId: athleteUid,
        title: "Inscrição cancelada",
        body: buildRemovalNotificationBody({
          description: description.value,
          wasPaid,
          refundAmount,
          organizerPhone: organizerContact?.whatsappPhone,
        }),
        type: "tournament_registration_cancelled",
        data: {
          tournamentId,
          url: `/torneios/${tournamentId}`,
          // Guardado também cru pra uma futura ação "Falar no WhatsApp" no card
          // da notificação não depender de callable nenhuma.
          ...(organizerContact?.whatsappPhone
            ? {
              organizerName: organizerContact.name,
              organizerWhatsapp: organizerContact.whatsappPhone,
            }
            : {}),
        },
      }).catch(() => undefined),
    ),
  );

  logger.info("Organizer removed registration from category", {
    registrationId,
    tournamentId,
    uid,
    wasPaid,
  });

  return {ok: true, refundPending: wasPaid, refundAmount};
});

export const resendRegistrationPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const data = snap.data()!;
  const tournamentId = (data.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);

  const teamId = (data.teamId as string)?.trim();
  if (!teamId) throw new HttpsError("failed-precondition", "Equipe inválida");

  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  const team = teamSnap.data();
  if (!team) throw new HttpsError("failed-precondition", "Equipe inválida");

  const categoryId = (data.categoryId as string)?.trim() ?? "";
  const sharePaidUids = sharePaidUidsFromRegistration(data);
  const athleteUids = [team.player1Id, team.player2Id]
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id, idx, arr) => id.length > 0 && arr.indexOf(id) === idx);
  const pendingUids = athleteUids.filter((id) => !sharePaidUids.includes(id));
  if (pendingUids.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Todos os atletas desta inscrição já pagaram.",
    );
  }

  const paymentPath =
    `/torneios/${tournamentId}/inscricao` +
    `?registrationId=${encodeURIComponent(registrationId)}` +
    (categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : "") +
    "&step=payment";

  await Promise.all(
    pendingUids.map((athleteUid) =>
      deliverNotificationToUser({
        userId: athleteUid,
        title: "Cobrança de inscrição",
        body: "O organizador reenviou a cobrança da sua inscrição no torneio.",
        type: "tournament_payment_reminder",
        data: {
          tournamentId,
          registrationId,
          ...(categoryId ? {categoryId} : {}),
          url: paymentPath,
        },
        requireInteraction: true,
      }),
    ),
  );

  return {ok: true, notifiedCount: pendingUids.length};
});

export interface SendCategoryCommunicationInput {
  tournamentId: string;
  categoryId: string;
  message: string;
  audience?: string;
  sendPush?: boolean;
}

export async function sendCategoryCommunicationCore(
  db: Firestore,
  uid: string,
  input: SendCategoryCommunicationInput,
  projectId: string = getFirebaseProjectId(),
): Promise<{
  pushCount: number;
  pushNoChannel: number;
  pushFailed: number;
  whatsappLinks: Array<{teamId: string; links: string[]}>;
}> {
  const tournamentId = input.tournamentId?.trim();
  const categoryId = input.categoryId?.trim();
  const message = input.message?.trim();
  const audience = input.audience?.trim() || "all";
  const sendPush = input.sendPush !== false;

  if (!tournamentId || !categoryId || !message) {
    throw new HttpsError("invalid-argument", "Dados incompletos");
  }

  await assertCanManageTournament(db, uid, tournamentId);

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const whatsappLinks: Array<{teamId: string; links: string[]}> = [];
  let pushSent = 0;
  let pushNoChannel = 0;
  let pushFailed = 0;

  for (const doc of inscriptionsSnap.docs) {
    const inscription = doc.data();
    const confirmed =
      inscription.isPaid === true && inscription.waitlist !== true;
    if (audience === "paid" && !confirmed) continue;
    if (audience === "pending" && confirmed) continue;

    const teamId = (inscription.teamId as string)?.trim();
    if (!teamId) continue;

    const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
    if (!teamSnap.exists) continue;
    const team = teamSnap.data()!;
    const playerIds = [team.player1Id, team.player2Id].filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );

    const links: string[] = [];
    for (const playerId of playerIds) {
      const userSnap = await db.doc(`users/${playerId}`).get();
      const phone = (userSnap.data()?.phoneNumber as string)?.trim() ?? "";
      if (phone) {
        const waPhone = normalizePhoneForWhatsApp(phone);
        links.push(
          `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`,
        );
      }
      if (sendPush) {
        const result = await deliverNotificationToUser({
          userId: playerId,
          title: "Mensagem do organizador",
          body: message.slice(0, 180),
          type: "tournament_communication",
          data: {tournamentId, categoryId},
          requireInteraction: false,
        });
        if (result.sent > 0) pushSent++;
        else if (result.failed > 0) pushFailed++;
        else pushNoChannel++;
      }
    }
    whatsappLinks.push({teamId, links});
  }

  try {
    await db.collection(`tournaments/${tournamentId}/categoryCommunications`).add({
      categoryId,
      message,
      audience,
      sendPush,
      pushCount: pushSent,
      pushNoChannel,
      pushFailed,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });
  } catch (historyError) {
    logger.warn(
      `Histórico de comunicação falhou para tournament=${tournamentId}`,
      historyError,
    );
  }

  return {pushCount: pushSent, pushNoChannel, pushFailed, whatsappLinks};
}

export const sendCategoryCommunication = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  return sendCategoryCommunicationCore(getFirestore(), uid, {
    tournamentId: request.data?.tournamentId as string,
    categoryId: request.data?.categoryId as string,
    message: request.data?.message as string,
    audience: request.data?.audience as string,
    sendPush: request.data?.sendPush,
  });
});

export const closeTournamentRegistrations = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  const tournament = await assertCanManageTournament(db, uid, tournamentId);
  const categories = ((tournament.categories as unknown[]) ?? []).map((item) => {
    if (typeof item !== "object" || item === null) return item;
    return {...(item as Record<string, unknown>), registrationClosed: true};
  });

  await db.doc(`tournaments/${tournamentId}`).update({
    listingStatus: "closed",
    categories,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true};
});

/**
 * Avisa as duplas pagas de que o torneio foi cancelado (para buscarem o
 * reembolso). Resolve os times pagos -> uids dos atletas e entrega push+inbox.
 * Best-effort: falhas aqui não revertem o cancelamento já efetivado.
 */
async function notifyPaidTeamsOfCancellation(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  tournamentName: string,
  paidTeamIds: string[],
): Promise<void> {
  const uids = new Set<string>();
  for (const teamId of paidTeamIds) {
    const teamSnap = await db
      .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
      .get();
    const team = teamSnap.data() ?? {};
    for (const id of [team.player1Id, team.player2Id]) {
      if (typeof id === "string" && id.trim()) uids.add(id.trim());
    }
  }

  const body =
    `${tournamentName} foi cancelado pelo organizador. ` +
    "Procure o organizador para tratar do reembolso.";
  await Promise.all(
    [...uids].map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: "Torneio cancelado",
        body,
        type: "tournament_cancelled",
        data: {tournamentId, url: `/torneios/${tournamentId}`},
      }),
    ),
  );
}

export const cancelTournament = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  await assertCanManageTournament(db, uid, tournamentId);

  // Integridade financeira: não cancelar silenciosamente um torneio com
  // inscrições pagas — não há estorno automático, então o organizador precisa
  // confirmar (force) que vai reembolsar manualmente.
  const projectId = getFirebaseProjectId();
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const paidCount = countPaidRegistrations(
    inscriptionsSnap.docs.map((d) => d.data()),
  );
  const force = request.data?.force === true;
  if (!canCancelTournament({paidCount, force})) {
    throw new HttpsError(
      "failed-precondition",
      `${paidCount} dupla(s) já pagaram a inscrição. Cancelar exige reembolso ` +
        "manual — confirme para prosseguir.",
      {reason: "has_paid_registrations", paidCount},
    );
  }

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
  await tournamentRef.update({
    listingStatus: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    refundsPending: paidCount > 0,
    paidRegistrationsAtCancel: paidCount,
    updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info("Torneio cancelado pelo organizador", {
    tournamentId,
    uid,
    paidCount,
    force,
  });

  // Avisa as duplas pagas para buscarem o reembolso (best-effort).
  if (paidCount > 0) {
    try {
      const tournamentSnap = await tournamentRef.get();
      const tournamentName =
        typeof tournamentSnap.data()?.name === "string" ?
          (tournamentSnap.data()?.name as string) :
          "O torneio";
      const paidTeamIds = paidTeamIdsForCancellation(
        inscriptionsSnap.docs.map((d) => d.data()),
      );
      await notifyPaidTeamsOfCancellation(
        db,
        projectId,
        tournamentId,
        tournamentName,
        paidTeamIds,
      );
    } catch (e) {
      logger.error("cancelTournament: falha ao notificar duplas pagas", {
        tournamentId,
        e,
      });
    }
  }

  return {ok: true, paidCount};
});
