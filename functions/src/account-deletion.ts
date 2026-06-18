import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";

/**
 * Exclusão de conta iniciada pelo próprio usuário (LGPD + App Store 5.1.1(v)).
 *
 * Apaga os dados pessoais sob `users/{uid}` (e subcoleções: notifications,
 * tokens, favorites, ...) e remove a conta de autenticação. Registros
 * operacionais/financeiros de torneios (inscrições, pagamentos) NÃO são
 * apagados aqui — são mantidos por exigência fiscal e para não corromper
 * chaves em andamento; a referência ao usuário fica órfã.
 */
export const deleteOwnAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const db = getFirestore();

  try {
    // Apaga o documento do usuário e todas as subcoleções recursivamente.
    await db.recursiveDelete(db.doc(`users/${uid}`));
  } catch (e) {
    logger.error("deleteOwnAccount: falha ao apagar dados do usuário", {uid, e});
    throw new HttpsError(
      "internal",
      "Não foi possível apagar seus dados agora. Tente novamente.",
    );
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (e) {
    logger.error("deleteOwnAccount: falha ao remover a conta de auth", {uid, e});
    throw new HttpsError(
      "internal",
      "Seus dados foram apagados, mas a conta de acesso não pôde ser removida. " +
        "Contate o suporte.",
    );
  }

  return {ok: true};
});
