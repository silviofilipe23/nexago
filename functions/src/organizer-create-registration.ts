/**
 * `organizerCreateTeamRegistration` — o organizador inscreve uma dupla que não conseguiu se
 * inscrever sozinha (prazo estourado, convite nunca aceito, pagamento travado).
 *
 * É o MESMO motor do aceite de convite, sem o convite: `resolvePartnerRegistrationPlan` decide
 * entre criar dupla nova, fechar a dupla sobre uma reserva solo que já existe (o caso mais
 * comum: um atleta reservou e o parceiro sumiu) ou bloquear por unicidade. Reusar essa decisão
 * é o ponto do desenho — duplicá-la aqui é como duas duplas iguais entram na mesma chave.
 *
 * O que o organizador PODE furar: prazo e vitrine fechada. O que ele NÃO fura: torneio
 * cancelado/rascunho, categoria concluída, nível (anti-sandbagging), idade e unicidade da dupla.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {assertCanManageTournament} from "./tournament-acl";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  resolveCategoryEntryFee,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {
  loadCategoryRegistrationsTx,
  registrationConflictMessage,
} from "./tournament-pair-uniqueness";
import {
  asTournamentCategory,
  cancelPendingPartnerInvitesForRegistrations,
  categoryRequiresUniform,
  registrationUniformForSlot,
  validateUniformPayload,
} from "./tournament-partner-invite";
import {refreshRegistrationHold} from "./tournament-registration-hold-ops";
import {resolvePartnerRegistrationPlan} from "./tournament-solo-registration";
import {isTeamCategory} from "./tournament-team-category";
import {setTeamGenderWhenRegistrationPaid} from "./tournament-team-roster";
import {
  buildOrganizerPaymentFields,
  buildOrganizerRegistrationDoc,
  effectiveUniformCategory,
  organizerRegistrationNotification,
  organizerRegistrationStamp,
  parseCreateTeamRegistrationInput,
  resolveJoiningUid,
} from "./organizer-create-registration-core";

/** Confere que os dois atletas existem antes de escrever qualquer coisa. */
async function assertAthletesExist(
  db: Firestore,
  uids: readonly string[],
): Promise<void> {
  const snaps = await Promise.all(
    uids.map((uid) => db.doc(`users/${uid}`).get()),
  );
  const missing = snaps.some((snap) => !snap.exists);
  if (missing) {
    throw new HttpsError(
      "not-found",
      "Atleta não encontrado. Selecione os dois pela busca.",
    );
  }
}

export const organizerCreateTeamRegistration = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const organizerUid = request.auth?.uid;
  if (!organizerUid) {
    throw new HttpsError("unauthenticated", "Login necessário");
  }

  const {tournamentId, categoryId, athleteUids, markAsPaid, uniforms} =
    parseCreateTeamRegistrationInput(request.data);
  const [uidA, uidB] = athleteUids;

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  await assertCanManageTournament(db, organizerUid, tournamentId);

  const tournament = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
    {allowClosedRegistration: true},
  );
  const shouldWaitlist = tournament.__shouldWaitlist === true;
  const category = findCategory(tournament, categoryId);

  // Categoria de trio+ tem elenco nomeado pelo capitão e uniforme por uid — nada disso cabe
  // num formulário de dupla, e uma "dupla" em categoria de quarteto entraria torta na chave.
  if (isTeamCategory(category)) {
    throw new HttpsError(
      "failed-precondition",
      "Esta categoria é de equipe. Use a inscrição de equipe para montar o elenco.",
    );
  }

  // Uniforme é obrigatório para o organizador na mesma medida em que é para o atleta: a
  // inscrição criada aqui não pode nascer com um pedido de uniforme pela metade.
  const uniformCategory = asTournamentCategory(category);
  const requiresUniform =
    uniformCategory != null &&
    categoryRequiresUniform(effectiveUniformCategory(tournament, uniformCategory));
  if (requiresUniform && uniformCategory) {
    const effective = effectiveUniformCategory(tournament, uniformCategory);
    for (const uid of athleteUids) {
      validateUniformPayload(effective, uniforms[uid] ?? null, true);
    }
  }

  await assertAthletesExist(db, athleteUids);
  await assertTeamLevelEligibility({db, tournament, category, uids: [uidA, uidB]});
  await assertTeamAgeEligibility({db, tournament, category, uids: [uidA, uidB]});

  const entryFee = resolveCategoryEntryFee(tournament, categoryId);
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const teamsPath = artifactsTeamsPath(projectId);
  const teamsRef = db.collection(teamsPath);

  const result = await db.runTransaction(async (tx) => {
    const categoryRegs = await loadCategoryRegistrationsTx(
      tx,
      inscriptionsRef,
      teamsPath,
      tournamentId,
      categoryKeys,
    );
    const plan = resolvePartnerRegistrationPlan(categoryRegs, uidA, uidB);
    if (plan.kind === "blocked") {
      throw new HttpsError(
        "failed-precondition",
        registrationConflictMessage(plan.reason),
      );
    }

    if (plan.kind === "attach") {
      // Fecha a dupla sobre a reserva que já existe — todas as leituras antes de qualquer
      // escrita (exigência da transaction).
      const baseRegRef = inscriptionsRef.doc(plan.registrationId);
      const baseRegSnap = await tx.get(baseRegRef);
      if (!baseRegSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Inscrição solo não encontrada.",
        );
      }
      const baseReg = baseRegSnap.data()!;

      const releaseRegRef = plan.releaseRegistrationId ?
        inscriptionsRef.doc(plan.releaseRegistrationId) :
        null;
      const releaseRegSnap = releaseRegRef ? await tx.get(releaseRegRef) : null;

      const baseTeamId = (baseReg.teamId as string | undefined)?.trim() ?? "";
      const existingTeamSnap = baseTeamId ?
        await tx.get(teamsRef.doc(baseTeamId)) :
        null;
      if (baseTeamId && !existingTeamSnap?.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Equipe da inscrição não encontrada.",
        );
      }

      // O dono vem do plano (que já olhou equipe e inscrição), não de um campo solto.
      const baseOwnerUid =
        categoryRegs.find((r) => r.registrationId === plan.registrationId)
          ?.ownerUid ?? uidA;
      const joiningUid = resolveJoiningUid(baseOwnerUid, uidA, uidB);
      const basePaid = baseReg.isPaid === true;

      const update: Record<string, unknown> = {
        participantUids: FieldValue.arrayUnion(joiningUid),
        partnerPending: false,
        updatedAt: FieldValue.serverTimestamp(),
        ...organizerRegistrationStamp(
          organizerUid,
          FieldValue.serverTimestamp(),
        ),
      };

      // Slot do uniforme segue quem é player1 na inscrição que sobrevive — não a ordem em
      // que o organizador escolheu os atletas na tela.
      const ownerUniform = uniforms[baseOwnerUid];
      const joiningUniform = uniforms[joiningUid];
      if (ownerUniform) {
        Object.assign(update, registrationUniformForSlot(ownerUniform, "Player1"));
      }
      if (joiningUniform) {
        Object.assign(update, registrationUniformForSlot(joiningUniform, "Player2"));
      }
      // Reserva já paga (o atleta pagou o total) → o parceiro entra sem taxa.
      if (basePaid) {
        update.sharePaidUids = FieldValue.arrayUnion(joiningUid);
      }

      const payment = buildOrganizerPaymentFields({
        entryFee,
        markAsPaid,
        alreadyPaid: basePaid,
        organizerUid,
        timestamp: FieldValue.serverTimestamp(),
      });
      if (payment) Object.assign(update, payment);

      let teamId = baseTeamId;
      if (baseTeamId) {
        // Solo legado: a equipe de 1 atleta já existe → preenche o player2.
        tx.update(teamsRef.doc(baseTeamId), {player2Id: joiningUid});
      } else {
        // Solo novo: a equipe nasce agora, como no aceite do convite.
        const teamRef = teamsRef.doc();
        tx.set(teamRef, {
          player1Id: baseOwnerUid,
          player2Id: joiningUid,
          createdAt: FieldValue.serverTimestamp(),
        });
        teamId = teamRef.id;
        update.teamId = teamId;
      }

      // Os dois reservaram solo: a dupla ocupa uma vaga só.
      if (releaseRegRef && releaseRegSnap?.exists) {
        tx.delete(releaseRegRef);
      }
      tx.update(baseRegRef, update);

      return {
        registrationId: plan.registrationId,
        teamId,
        merged: true,
        isPaid: basePaid || payment?.isPaid === true,
        waitlist: payment?.waitlist === false ?
          false :
          baseReg.waitlist === true,
        // Para a limpeza dos convites depois da transação: os convites que
        // morrem são os das DUAS inscrições envolvidas — a que recebeu a dupla
        // e a reserva solo que acabou de ser apagada.
        ownerUid: baseOwnerUid,
        releasedRegistrationId: plan.releaseRegistrationId,
        releasedOwnerUid: plan.releaseRegistrationId ?
          categoryRegs.find(
            (r) => r.registrationId === plan.releaseRegistrationId,
          )?.ownerUid ?? "" :
          "",
      };
    }

    const teamRef = teamsRef.doc();
    const regRef = inscriptionsRef.doc();
    tx.set(teamRef, {
      player1Id: uidA,
      player2Id: uidB,
      createdAt: FieldValue.serverTimestamp(),
    });

    const registrationDoc = buildOrganizerRegistrationDoc({
      teamId: teamRef.id,
      tournamentId,
      categoryId,
      athleteUids: [uidA, uidB],
      organizerUid,
      waitlist: shouldWaitlist,
      timestamp: FieldValue.serverTimestamp(),
    });
    const payment = buildOrganizerPaymentFields({
      entryFee,
      markAsPaid,
      alreadyPaid: false,
      organizerUid,
      timestamp: FieldValue.serverTimestamp(),
    });
    if (payment) Object.assign(registrationDoc, payment);
    if (uniforms[uidA]) {
      Object.assign(registrationDoc, registrationUniformForSlot(uniforms[uidA], "Player1"));
    }
    if (uniforms[uidB]) {
      Object.assign(registrationDoc, registrationUniformForSlot(uniforms[uidB], "Player2"));
    }
    tx.set(regRef, registrationDoc);

    return {
      registrationId: regRef.id,
      teamId: teamRef.id,
      merged: false,
      isPaid: payment?.isPaid === true,
      waitlist: registrationDoc.waitlist === true,
      ownerUid: uidA,
      releasedRegistrationId: "",
      releasedOwnerUid: "",
    };
  });

  logger.info("Organizer created team registration", {
    organizerUid,
    tournamentId,
    categoryId,
    ...result,
  });

  // Efeitos best-effort: a inscrição já está gravada, nenhum deles pode derrubar a resposta.

  // Fechar a dupla por fora do aceite não consome o convite: o que ninguém
  // respondeu — a razão de a tela existir — ficaria pendente apontando para uma
  // inscrição já cheia, e a reserva solo apagada deixaria os dela órfãos de um
  // documento que não existe mais. Antes do prazo, para o recálculo já ver o
  // estado limpo.
  if (result.merged) {
    try {
      const cancelledInvites =
        await cancelPendingPartnerInvitesForRegistrations({
          db,
          tournamentId,
          categoryId,
          targets: [
            {
              registrationId: result.registrationId,
              ownerUid: result.ownerUid,
            },
            {
              registrationId: result.releasedRegistrationId,
              ownerUid: result.releasedOwnerUid,
            },
          ],
          cancelReason: "registration_merged_by_organizer",
        });
      if (cancelledInvites > 0) {
        logger.info("Convites de dupla cancelados na fusão do organizador", {
          registrationId: result.registrationId,
          tournamentId,
          categoryId,
          cancelledInvites,
        });
      }
    } catch (inviteError) {
      logger.warn("Falha ao cancelar convites na fusão do organizador", {
        registrationId: result.registrationId,
        inviteError,
      });
    }
  }

  // Fechar a dupla sobre uma reserva que já existia reinicia o prazo da vaga:
  // o elenco parou de depender de alguém aceitar e passou a depender de alguém
  // pagar. `onlyIfPresent` porque a reserva-base pode ser de quem é imune
  // (anterior à regra, fila, criada pelo organizador) e fechar a dupla não pode
  // inventar um prazo para ela; `rosterClosed` porque o elenco fechou aqui, e o
  // recálculo não pode voltar a seguir convite: o cancelamento acima é
  // best-effort, e se ele falhar o prazo seguiria um convite pendente que não
  // segura mais nada, dando 48h a uma dupla já formada.
  //
  // A dupla NOVA fica de fora de propósito: nasce sem `holdExpiresAt`, imune,
  // como toda inscrição criada pelo organizador.
  if (result.merged) {
    await refreshRegistrationHold(db, projectId, result.registrationId, {
      onlyIfPresent: true,
      rosterClosed: true,
    });
  }

  if (result.isPaid) {
    try {
      await setTeamGenderWhenRegistrationPaid(db, projectId, result.teamId);
    } catch (genderError) {
      logger.warn(
        `Falha ao definir gender da equipe ${result.teamId}`,
        genderError,
      );
    }
  }

  const {title, body} = organizerRegistrationNotification({
    tournamentName: typeof tournament.name === "string" ? tournament.name : "",
    categoryName: categoryId,
    isPaid: result.isPaid,
  });
  await Promise.all(
    athleteUids.map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title,
        body,
        type: "tournament_registration_created_by_organizer",
        data: {
          tournamentId,
          registrationId: result.registrationId,
          url: `/torneios/${tournamentId}`,
        },
      }).catch(() => undefined),
    ),
  );

  return {
    registrationId: result.registrationId,
    teamId: result.teamId,
    merged: result.merged,
    waitlist: result.waitlist,
  };
});
