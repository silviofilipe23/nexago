/**
 * "Esta equipe já entrou em alguma chave?" — a pergunta que separa o doc de
 * equipe descartável do que sustenta partida publicada.
 *
 * Duas queries de campo único (mesmo padrão de index-avoidance do resto do
 * repo) em vez de um `or`: a partida guarda a equipe em `teamAId` OU `teamBId`,
 * e o índice automático de campo único já cobre as duas.
 */

import type {Firestore} from "firebase-admin/firestore";
import {artifactsMatchesPath} from "./firebase-paths";

export async function teamAppearsInAnyMatch(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<boolean> {
  const id = teamId.trim();
  if (!id) return false;
  const matches = db.collection(artifactsMatchesPath(projectId));
  const [comoA, comoB] = await Promise.all([
    matches.where("teamAId", "==", id).limit(1).get(),
    matches.where("teamBId", "==", id).limit(1).get(),
  ]);
  return !comoA.empty || !comoB.empty;
}
