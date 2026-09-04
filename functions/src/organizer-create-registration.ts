/**
 * `organizerCreateTeamRegistration` — o organizador inscreve uma dupla/equipe que não conseguiu
 * se inscrever sozinha (prazo estourado, convite nunca aceito, pagamento travado).
 *
 * Dupla: é o MESMO motor do aceite de convite, sem o convite — `resolvePartnerRegistrationPlan`
 * decide entre criar, fechar sobre reserva solo ou bloquear por unicidade.
 *
 * Equipe (trio+): cria a equipe nomeada com elenco completo (`partnerPending: false`), sem
 * o fluxo de convites do capitão. O organizador monta todos de uma vez.
 *
 * O que o organizador PODE furar: prazo e vitrine fechada. O que ele NÃO fura: torneio
 * cancelado/rascunho, categoria concluída, nível (anti-sandbagging), idade, unicidade e
 * composição de gênero.
 *
 * Categoria LOTADA não é furada, é aumentada: com `allowCapacityExpansion` (o organizador
 * marcou "abrir uma vaga extra", caso do atleta convidado), o teto da categoria sobe em 1 na
 * MESMA transação que cria a inscrição. A categoria passa a ter de fato uma vaga a mais, então
 * nenhum contador do painel, do app ou do site precisa aprender uma exceção.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
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
  categoryCapacityFullOf,
  findCategory,
  resolveCategoryEntryFee,
  resolveCategoryMatchKeys,
  resolveTournamentDocRef,
} from "./tournament-registration-guards";
import {
  planCategoryCapacityExpansion,
  type CategoryCapacityExpansion,
} from "./tournament-category-capacity";
import {
  loadCategoryRegistrationsTx,
  registrationConflictMessage,
} from "./tournament-pair-uniqueness";
import {
  asTournamentCategory,
  cancelPendingPartnerInvitesForRegistrations,
  categoryRequiresUniform,
  registrationUniformForSlot,
  uniformByUidEntry,
  validateUniformPayload,
} from "./tournament-partner-invite";
import {refreshRegistrationHold} from "./tournament-registration-hold-ops";
import {resolvePartnerRegistrationPlan} from "./tournament-solo-registration";
import type {AthleteGenderBucket} from "./tournament-registration-pix-helpers";
import {
  evaluateTeamJoin,
  isTeamCategory,
  normalizeTeamName,
  parseGenderComposition,
  resolveCategoryTeamSize,
  teamJoinDenialMessage,
  teamNameKey,
  teamNameValidationError,
} from "./tournament-team-category";
import {
  loadUserGenderBucket,
  setTeamGenderWhenRegistrationPaid,
} from "./tournament-team-roster";
import {
  assertAthleteUidsMatchCategorySize,
  buildOrganizerNamedTeamDoc,
  buildOrganizerPaymentFields,
  buildOrganizerRegistrationDoc,
  defaultOrganizerTeamName,
  effectiveUniformCategory,
  organizerRegistrationNotification,
  organizerRegistrationStamp,
  parseCreateTeamRegistrationInput,
  resolveJoiningUid,
} from "./organizer-create-registration-core";

/**
 * Vaga extra na categoria lotada, para o organizador inscrever atleta CONVIDADO.
 *
 * Em DUAS metades de propósito: o Firestore exige todas as leituras antes de qualquer escrita
 * numa transação, e a transação da inscrição lê muita coisa. Então `readCapacityExpansionPlan`
 * entra junto das outras leituras e `applyCapacityExpansion` junto das outras escritas — o
 * teto sobe na MESMA transação que cria a inscrição. Ou entra a equipe com a vaga, ou nada:
 * nem vaga fantasma se a criação falhar, nem categoria estourada se o teto não subir.
 */
async function readCapacityExpansionPlan(params: {
  tx: Transaction;
  tournamentRef: DocumentReference | null;
  categoryId: string;
  /** Ocupação medida pelo guard; a fila de espera não conta. */
  occupied: number;
}): Promise<CategoryCapacityExpansion | null> {
  const {tx, tournamentRef, categoryId, occupied} = params;
  if (!tournamentRef) return null;

  const snap = await tx.get(tournamentRef);
  return planCategoryCapacityExpansion({
    categories: snap.data()?.categories as unknown[] | undefined,
    categoryKey: categoryId,
    occupied,
  });
}

/**
 * Grava o teto novo. `plan` nulo é desfecho normal: entre o guard e a transação alguém pode ter
 * cancelado uma inscrição ou já ter aberto a vaga — aí a equipe ocupa a vaga que existe.
 */
function applyCapacityExpansion(
  tx: Transaction,
  tournamentRef: DocumentReference | null,
  plan: CategoryCapacityExpansion | null,
): void {
  if (!tournamentRef || !plan) return;
  tx.update(tournamentRef, {categories: plan.categories});
}

/** Só o "de → para" vai pro log: o array `categories` inteiro não cabe numa linha de log. */
function capacityLogFields(
  plan: CategoryCapacityExpansion | null,
): Record<string, unknown> {
  if (!plan) return {};
  return {capacityExpandedFrom: plan.from, capacityExpandedTo: plan.to};
}

/** Resposta da callable no que diz respeito à vaga extra. */
function capacityResult(
  plan: CategoryCapacityExpansion | null,
): Record<string, unknown> {
  if (!plan) return {capacityExpanded: false};
  return {capacityExpanded: true, capacityFrom: plan.from, capacityTo: plan.to};
}

/** Confere que todos os atletas existem antes de escrever qualquer coisa. */
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
      "Atleta não encontrado. Selecione os atletas pela busca.",
    );
  }
}

/** Nome exibível do atleta (users/{uid}) — usado no nome padrão da equipe. */
async function loadAthleteDisplayName(
  db: Firestore,
  uid: string,
): Promise<string> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const data = snap.data() ?? {};
    for (const key of ["name", "displayName", "fullName", "firstName"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // fallback abaixo
  }
  return "Atleta";
}

/**
 * Valida composição de gênero do elenco completo (um a um, na ordem enviada).
 * Sem composição, não há o que checar.
 */
async function assertTeamGenderComposition(params: {
  db: Firestore;
  category: Record<string, unknown>;
  teamSize: number;
  athleteUids: readonly string[];
}): Promise<void> {
  const {db, category, teamSize, athleteUids} = params;
  const composition = parseGenderComposition(category, teamSize);
  if (!composition) return;

  const currentBuckets: Array<AthleteGenderBucket | null> = [];
  for (const uid of athleteUids) {
    const joiningBucket = await loadUserGenderBucket(db, uid);
    const joinCheck = evaluateTeamJoin({
      teamSize,
      composition,
      currentBuckets,
      joiningBucket,
    });
    if (!joinCheck.ok) {
      throw new HttpsError(
        "failed-precondition",
        teamJoinDenialMessage(joinCheck.reason, "invitee"),
      );
    }
    currentBuckets.push(joiningBucket);
  }
}

/**
 * Nenhum atleta já inscrito na categoria + nome de equipe único (quando nomeado).
 */
async function assertTeamCategoryAvailability(params: {
  db: Firestore;
  projectId: string;
  tournamentId: string;
  categoryKeys: Set<string>;
  athleteUids: readonly string[];
  nameKey: string;
}): Promise<void> {
  const {
    db,
    projectId,
    tournamentId,
    categoryKeys,
    athleteUids,
    nameKey,
  } = params;
  const uidSet = new Set(athleteUids);
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!categoryKeys.has(String(data.categoryId ?? "").trim())) continue;

    const participants = Array.isArray(data.participantUids)
      ? (data.participantUids as unknown[]).map((p) => String(p).trim())
      : [];
    const player1Id = String(data.player1Id ?? "").trim();
    const captainUid = String(data.captainUid ?? "").trim();
    const already = [...participants, player1Id, captainUid].some(
      (uid) => uid && uidSet.has(uid),
    );
    if (already) {
      throw new HttpsError(
        "failed-precondition",
        "Um dos atletas já possui inscrição nesta categoria.",
      );
    }

    const existingName = String(data.teamName ?? "").trim();
    if (existingName && teamNameKey(existingName) === nameKey) {
      throw new HttpsError(
        "already-exists",
        "Já existe uma equipe com esse nome nesta categoria. Escolha outro nome.",
      );
    }
  }
}

export const organizerCreateTeamRegistration = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const organizerUid = request.auth?.uid;
  if (!organizerUid) {
    throw new HttpsError("unauthenticated", "Login necessário");
  }

  const {
    tournamentId,
    categoryId,
    athleteUids,
    markAsPaid,
    uniforms,
    teamName: teamNameInput,
    allowCapacityExpansion,
  } = parseCreateTeamRegistrationInput(request.data);

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  await assertCanManageTournament(db, organizerUid, tournamentId);

  const tournament = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
    {allowClosedRegistration: true, allowCapacityExpansion},
  );
  const shouldWaitlist = tournament.__shouldWaitlist === true;

  // Categoria lotada COM a permissão do organizador: a vaga extra é aberta na transação da
  // inscrição. Sem a permissão, o guard já resolveu sozinho (fila ou "Categoria lotada").
  const capacityFull = categoryCapacityFullOf(tournament);
  const tournamentRef = capacityFull ?
    await resolveTournamentDocRef(db, projectId, tournamentId) :
    null;
  if (capacityFull && !tournamentRef) {
    // Sem onde gravar o teto novo, criar a inscrição estouraria a categoria em silêncio.
    throw new HttpsError(
      "not-found",
      "Não foi possível abrir a vaga extra: torneio não encontrado.",
    );
  }

  const category = findCategory(tournament, categoryId);
  const teamSize = resolveCategoryTeamSize(category);
  assertAthleteUidsMatchCategorySize(athleteUids, teamSize);

  // Uniforme é obrigatório para o organizador na mesma medida em que é para o atleta.
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
  await assertTeamLevelEligibility({
    db,
    tournament,
    category,
    uids: [...athleteUids],
  });
  await assertTeamAgeEligibility({
    db,
    tournament,
    category,
    uids: [...athleteUids],
  });

  const entryFee = resolveCategoryEntryFee(tournament, categoryId);
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const teamsPath = artifactsTeamsPath(projectId);
  const teamsRef = db.collection(teamsPath);

  // ---------------------------------------------------------------------------
  // Equipe (trio+): elenco completo de uma vez, sem convite.
  // ---------------------------------------------------------------------------
  if (isTeamCategory(category)) {
    await assertTeamGenderComposition({
      db,
      category: category as Record<string, unknown>,
      teamSize,
      athleteUids,
    });

    let teamName = teamNameInput ? normalizeTeamName(teamNameInput) : "";
    if (!teamName) {
      const names = await Promise.all(
        athleteUids.map((uid) => loadAthleteDisplayName(db, uid)),
      );
      teamName = defaultOrganizerTeamName(names);
    }
    const nameError = teamNameValidationError(teamName);
    if (nameError) {
      throw new HttpsError("invalid-argument", nameError);
    }
    teamName = normalizeTeamName(teamName);
    const nameKey = teamNameKey(teamName);

    await assertTeamCategoryAvailability({
      db,
      projectId,
      tournamentId,
      categoryKeys,
      athleteUids,
      nameKey,
    });

    const result = await db.runTransaction(async (tx) => {
      const capacityPlan = capacityFull ?
        await readCapacityExpansionPlan({
          tx,
          tournamentRef,
          categoryId,
          occupied: capacityFull.occupied,
        }) :
        null;

      // Releitura estreita: evita duas equipes iguais se o organizador clicar duas vezes.
      for (const uid of athleteUids) {
        const mine = await tx.get(
          inscriptionsRef
            .where("tournamentId", "==", tournamentId)
            .where("participantUids", "array-contains", uid),
        );
        const alreadyInCategory = mine.docs.some((doc) =>
          categoryKeys.has(String(doc.data().categoryId ?? "").trim()),
        );
        if (alreadyInCategory) {
          throw new HttpsError(
            "failed-precondition",
            "Um dos atletas já possui inscrição nesta categoria.",
          );
        }
      }

      const teamRef = teamsRef.doc();
      const regRef = inscriptionsRef.doc();
      const timestamp = FieldValue.serverTimestamp();

      tx.set(
        teamRef,
        buildOrganizerNamedTeamDoc({
          tournamentId,
          categoryId,
          athleteUids,
          teamSize,
          teamName,
          timestamp,
        }),
      );

      const registrationDoc = buildOrganizerRegistrationDoc({
        teamId: teamRef.id,
        tournamentId,
        categoryId,
        athleteUids,
        organizerUid,
        waitlist: shouldWaitlist,
        timestamp,
        teamSize,
        teamName,
      });
      const payment = buildOrganizerPaymentFields({
        entryFee,
        markAsPaid,
        alreadyPaid: false,
        organizerUid,
        timestamp,
      });
      if (payment) Object.assign(registrationDoc, payment);

      const uniformByUid: Record<string, Record<string, string | number>> = {};
      for (const uid of athleteUids) {
        const uniform = uniforms[uid];
        if (uniform) uniformByUid[uid] = uniformByUidEntry(uniform);
      }
      if (Object.keys(uniformByUid).length > 0) {
        registrationDoc.uniformByUid = uniformByUid;
      }

      tx.set(regRef, registrationDoc);
      applyCapacityExpansion(tx, tournamentRef, capacityPlan);

      return {
        registrationId: regRef.id,
        teamId: teamRef.id,
        merged: false,
        isPaid: payment?.isPaid === true,
        waitlist: registrationDoc.waitlist === true,
        isTeam: true as const,
        capacity: capacityPlan,
      };
    });

    const {capacity: teamCapacity, ...teamLogFields} = result;
    logger.info("Organizer created named team registration", {
      organizerUid,
      tournamentId,
      categoryId,
      teamSize,
      ...teamLogFields,
      ...capacityLogFields(teamCapacity),
    });

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
      isTeam: true,
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
      ...capacityResult(teamCapacity),
    };
  }

  // ---------------------------------------------------------------------------
  // Dupla: motor de attach/create via resolvePartnerRegistrationPlan.
  // ---------------------------------------------------------------------------
  const [uidA, uidB] = athleteUids as [string, string];

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
        // Fechar a dupla sobre uma reserva que já existe NÃO consome vaga nova: nenhum
        // documento de inscrição nasce aqui (e quando os dois tinham reserva, um até morre).
        // Subir o teto neste caminho inventaria uma vaga que ninguém pediu.
        capacity: null as CategoryCapacityExpansion | null,
      };
    }

    const capacityPlan = capacityFull ?
      await readCapacityExpansionPlan({
        tx,
        tournamentRef,
        categoryId,
        occupied: capacityFull.occupied,
      }) :
      null;

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
    applyCapacityExpansion(tx, tournamentRef, capacityPlan);

    return {
      registrationId: regRef.id,
      teamId: teamRef.id,
      merged: false,
      isPaid: payment?.isPaid === true,
      waitlist: registrationDoc.waitlist === true,
      ownerUid: uidA,
      releasedRegistrationId: "",
      releasedOwnerUid: "",
      capacity: capacityPlan,
    };
  });

  const {capacity: pairCapacity, ...pairLogFields} = result;
  logger.info("Organizer created team registration", {
    organizerUid,
    tournamentId,
    categoryId,
    ...pairLogFields,
    ...capacityLogFields(pairCapacity),
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
    ...capacityResult(pairCapacity),
  };
});
