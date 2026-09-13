/**
 * Utilitários de elenco que tocam o Firestore — compartilhados entre o PIX de
 * inscrição, o webhook Asaas e as callables de convite/equipe. Substitui as
 * cópias privadas que cada arquivo mantinha presas em player1/player2.
 */

import {FieldValue, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {artifactsTeamsPath} from "./firebase-paths";
import {
  normalizeAthleteGenderBucket,
  type AthleteGenderBucket,
} from "./tournament-registration-pix-helpers";
import {
  DUPLA_TEAM_SIZE,
  MAX_TEAM_CATEGORY_SIZE,
  extractTeamMemberUids,
  teamGenderLabelForBuckets,
} from "./tournament-team-category";

/** Gênero normalizado de `users/{uid}` ("M"/"F"), ou `null`. */
export async function loadUserGenderBucket(
  db: Firestore,
  uid: string,
): Promise<AthleteGenderBucket | null> {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const gender = snap.data()?.gender;
  return normalizeAthleteGenderBucket(
    typeof gender === "string" ? gender : undefined,
  );
}

/** uids dos atletas do doc de equipe (memberUids ou player1/player2 legado). */
export async function loadTeamMemberUids(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<string[]> {
  if (!teamId) return [];
  const teamSnap = await db
    .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
    .get();
  if (!teamSnap.exists) return [];
  return extractTeamMemberUids(teamSnap.data());
}

/** Elenco esperado do doc de equipe: `teamSize` quando plausível, senão dupla. */
function expectedRosterSize(team: Record<string, unknown>): number {
  const rawSize = Number(team.teamSize);
  return Number.isInteger(rawSize) &&
    rawSize >= DUPLA_TEAM_SIZE &&
    rawSize <= MAX_TEAM_CATEGORY_SIZE ?
    rawSize :
    DUPLA_TEAM_SIZE;
}

/**
 * Gênero da equipe a partir do elenco gravado no doc. `null` = elenco
 * incompleto ou algum atleta sem `gender` declarado em `users/`.
 */
async function computeTeamGender(
  db: Firestore,
  team: Record<string, unknown>,
): Promise<string | null> {
  const members = extractTeamMemberUids(team);
  if (members.length < expectedRosterSize(team)) return null;
  const buckets = await Promise.all(
    members.map((uid) => loadUserGenderBucket(db, uid)),
  );
  return teamGenderLabelForBuckets(buckets);
}

/**
 * Carimba a equipe como inscrição PAGA — o portão único das listagens
 * públicas ("Descobrir equipes" no app, "Minhas equipes" no portal, busca).
 *
 * `registrationPaid` é o marcador de que a equipe existe de verdade: só é
 * gravado aqui, e só quem chama sabe que a inscrição fechou. Equipe criada no
 * aceite do convite e nunca paga jamais recebe o campo, então nasce fora das
 * listagens em vez de precisar ser caçada depois.
 *
 * O `gender` vai junto porque é o mesmo instante — e é gravado com o elenco
 * completo e todos os gêneros conhecidos. Quando não dá para calcular, o
 * carimbo de pagamento vai sozinho: "pagou" não pode depender de um atleta ter
 * declarado o gênero no perfil.
 */
export async function markTeamRegistrationPaid(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<void> {
  if (!teamId) return;

  const teamRef = db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    logger.warn(`Team ${teamId} não encontrado para carimbar pagamento`);
    return;
  }

  const data = teamSnap.data() ?? {};
  const teamGender = await computeTeamGender(db, data);
  if (!teamGender) {
    logger.warn(
      `Team ${teamId}: não foi possível calcular gender (elenco ou perfil incompleto)`,
    );
  }

  await teamRef.set(
    {
      registrationPaid: true,
      ...(teamGender ? {gender: teamGender} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  logger.info(
    `Team ${teamId}: registrationPaid=true gender=${teamGender ?? "(indefinido)"}`,
  );
}

/**
 * Recalcula `gender` num elenco que MUDOU depois de pago (substituição de
 * atleta). Sem isso a equipe que trocou um homem por uma mulher seguia rotulada
 * "Masculino" — o carimbo original só roda no instante do pagamento.
 *
 * Não cria o campo do zero em equipe não paga: sem `registrationPaid` a equipe
 * não aparece em listagem nenhuma, e o carimbo vem depois com o gênero certo.
 */
export async function recomputeTeamGenderAfterRosterChange(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<void> {
  if (!teamId) return;

  const teamRef = db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) return;

  const data = teamSnap.data() ?? {};
  if (data.registrationPaid !== true) return;

  const teamGender = await computeTeamGender(db, data);
  if (!teamGender) {
    logger.warn(
      `Team ${teamId}: elenco mudou mas não foi possível recalcular gender`,
    );
    return;
  }
  if (teamGender === data.gender) return;

  await teamRef.set(
    {gender: teamGender, updatedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  logger.info(`Team ${teamId}: gender recalculado para ${teamGender}`);
}
