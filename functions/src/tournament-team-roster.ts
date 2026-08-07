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

/**
 * Define `gender` no documento da equipe quando a inscrição fica 100% paga.
 * Só grava com o elenco completo (dupla ou os N da categoria de equipe) e com
 * o gênero de todos conhecido.
 */
export async function setTeamGenderWhenRegistrationPaid(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<void> {
  if (!teamId) return;

  const teamRef = db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    logger.warn(`Team ${teamId} não encontrado para definir gender`);
    return;
  }

  const data = teamSnap.data() ?? {};
  const members = extractTeamMemberUids(data);
  const rawSize = Number(data.teamSize);
  const expectedSize =
    Number.isInteger(rawSize) &&
    rawSize >= DUPLA_TEAM_SIZE &&
    rawSize <= MAX_TEAM_CATEGORY_SIZE
      ? rawSize
      : DUPLA_TEAM_SIZE;
  if (members.length < expectedSize) return;

  const buckets = await Promise.all(
    members.map((uid) => loadUserGenderBucket(db, uid)),
  );
  const teamGender = teamGenderLabelForBuckets(buckets);
  if (!teamGender) {
    logger.warn(
      `Team ${teamId}: não foi possível calcular gender (${buckets.map(String).join(",")})`,
    );
    return;
  }

  await teamRef.set(
    {
      gender: teamGender,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  logger.info(`Team ${teamId}: gender=${teamGender}`);
}
