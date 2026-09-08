/**
 * Passe de vaga — o organizador libera UMA vaga nominal numa categoria lotada, e o atleta
 * convidado se inscreve e paga sozinho, pelo fluxo normal do app.
 *
 * A diferença para a vaga extra de `organizerCreateTeamRegistration` é quem dirige: lá o
 * organizador monta a inscrição inteira (e a LGPD nasce pendente, e o uniforme é ele quem
 * preenche); aqui ele só abre a porta para uma pessoa, e quem convida o parceiro, aceita a
 * LGPD, escolhe o uniforme e paga é o atleta.
 *
 * Três invariantes que sustentam o "não pode ser aberto para todos":
 *
 * - **O teto só sobe no instante em que o convidado se inscreve.** Enquanto o passe está vivo a
 *   categoria continua lotada para o mundo — ninguém tem uma janela para passar na frente dele.
 * - **A validade é CALCULADA, não gravada.** O passe morre quando a chave da categoria sai, e
 *   isso é perguntado ao torneio (`categoryBracketPublished`) a cada uso. Se a marcação em lote
 *   falhar, a lista do organizador fica feia; vaga depois da chave, nunca.
 * - **A queima é transacional junto da inscrição.** Ou nasce a inscrição com o teto subido e o
 *   passe usado, ou não nasce nada.
 *
 * Este arquivo é o núcleo (consulta, queima, devolução) e de propósito NÃO importa
 * `tournament-registration-guards`: é o portão que importa daqui. As callables do organizador
 * ficam em `tournament-spot-pass-ops.ts`, que pode importar os dois.
 */

import {FieldValue} from "firebase-admin/firestore";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import {categoryBracketPublished} from "./tournament-category-bracket-status";

export const SPOT_PASSES_COLLECTION = "tournamentSpotPasses";

/**
 * `active` é o único estado que abre vaga. `used` queimou numa inscrição, `revoked` o
 * organizador desfez, `expired` a chave saiu por baixo dele.
 */
export type SpotPassStatus = "active" | "used" | "revoked" | "expired";

/** Campo gravado NA INSCRIÇÃO que nasceu de um passe — é por ele que a devolução acha o passe. */
export const REGISTRATION_SPOT_PASS_FIELD = "spotPassId";

/** Passe vivo encontrado para um dos atletas da inscrição que está nascendo. */
export interface ClaimableSpotPass {
  id: string;
  ref: DocumentReference;
  athleteUid: string;
  categoryId: string;
}

/** `in` do Firestore aceita no máximo 10 valores; equipe grande não passa disso, mas corta. */
const MAX_CLAIMANTS = 10;

/**
 * Passe vivo que autoriza esta inscrição, ou `null`.
 *
 * `claimantUids` é plural porque o dono do passe nem sempre é quem chama: em torneio que exige
 * dupla já formada a inscrição nasce no ACEITE do convite, e quem chama ali é o parceiro. Olhar
 * só o autenticado mataria a vaga liberada justamente no fluxo em que o convidado chama alguém.
 *
 * A categoria é conferida em memória contra as chaves equivalentes (`resolveCategoryMatchKeys`)
 * porque a consulta já gasta seu único `in` com os atletas.
 */
export async function findClaimableSpotPass(params: {
  db: Firestore;
  /** Documento do torneio já carregado pelo portão. */
  tournament: Record<string, unknown>;
  tournamentId: string;
  categoryKeys: Set<string>;
  claimantUids: string[];
}): Promise<ClaimableSpotPass | null> {
  const {db, tournament, tournamentId, categoryKeys} = params;

  const uids = Array.from(
    new Set(
      params.claimantUids
        .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
        .filter((uid) => uid.length > 0),
    ),
  ).slice(0, MAX_CLAIMANTS);
  if (uids.length === 0) return null;

  // A chave já saiu: nenhum passe vale, mesmo os que ainda constam `active`.
  if (categoryBracketPublished(tournament, categoryKeys)) return null;

  const snap = await db
    .collection(SPOT_PASSES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "active")
    .where("athleteUid", "in", uids)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const categoryId = String(data.categoryId ?? "").trim();
    if (!categoryKeys.has(categoryId)) continue;
    return {
      id: doc.id,
      ref: doc.ref,
      athleteUid: String(data.athleteUid ?? "").trim(),
      categoryId,
    };
  }
  return null;
}

/** Retrato do passe que o portão anotou no torneio, para quem for persistir a inscrição. */
export interface SpotPassAnnotation {
  id: string;
  path: string;
  athleteUid: string;
  categoryId: string;
}

/** Anota o passe encontrado — mesmo mecanismo de `__shouldWaitlist`, sem persistir nada. */
export function annotateSpotPass(
  tournament: Record<string, unknown>,
  pass: ClaimableSpotPass,
): void {
  tournament.__spotPass = {
    id: pass.id,
    path: pass.ref.path,
    athleteUid: pass.athleteUid,
    categoryId: pass.categoryId,
  } satisfies SpotPassAnnotation;
}

/** Lê o `__spotPass` anotado pelo portão; `null` quando a vaga não veio de passe. */
export function spotPassAnnotationOf(
  tournament: Record<string, unknown> | null | undefined,
): SpotPassAnnotation | null {
  const raw = tournament?.__spotPass;
  if (!raw || typeof raw !== "object") return null;
  const {id, path, athleteUid, categoryId} = raw as Record<string, unknown>;
  if (typeof id !== "string" || typeof path !== "string") return null;
  return {
    id,
    path,
    athleteUid: String(athleteUid ?? ""),
    categoryId: String(categoryId ?? ""),
  };
}

/**
 * Relê o passe DENTRO da transação e confirma que ele ainda está `active`.
 *
 * Vai junto das outras leituras (o Firestore exige todas antes de qualquer escrita). É esta
 * releitura que impede o passe de ser queimado duas vezes por duas inscrições simultâneas: a
 * segunda transação vê a escrita da primeira e é reexecutada.
 */
export async function getActiveSpotPassRefTx(
  tx: Transaction,
  db: Firestore,
  annotation: SpotPassAnnotation | null,
): Promise<DocumentReference | null> {
  if (!annotation) return null;
  const ref = db.doc(annotation.path);
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  return snap.data()?.status === "active" ? ref : null;
}

/** Queima o passe na mesma transação que cria a inscrição. */
export function markSpotPassUsedTx(
  tx: Transaction,
  ref: DocumentReference | null,
  registrationId: string,
): void {
  if (!ref) return;
  tx.update(ref, {
    status: "used" satisfies SpotPassStatus,
    usedAt: FieldValue.serverTimestamp(),
    usedRegistrationId: registrationId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Marca como `expired` os passes vivos de uma categoria quando a chave é publicada.
 *
 * É **cortesia visual**, não trava: quem impede a vaga depois da chave é o
 * `categoryBracketPublished` consultado a cada uso. Se esta escrita falhar, a lista do
 * organizador fica mostrando "ativo" num passe que já não abre nada — feio, nunca perigoso.
 *
 * Devolve quantos passes morreram.
 */
export async function expireSpotPassesForCategory(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
): Promise<number> {
  const snap = await db
    .collection(SPOT_PASSES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "active")
    .get();

  const stale = snap.docs.filter(
    (doc) => String(doc.data()?.categoryId ?? "").trim() === categoryId.trim(),
  );
  if (stale.length === 0) return 0;

  const batch = db.batch();
  for (const doc of stale) {
    batch.update(doc.ref, {
      status: "expired" satisfies SpotPassStatus,
      expiredReason: "bracket_published",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return stale.length;
}
