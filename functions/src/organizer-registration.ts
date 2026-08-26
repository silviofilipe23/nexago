import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {callerCanAccessBackoffice} from "./auth-roles";
import {isValidCommissionPercent} from "./platform-fees";

/**
 * Cadastro do organizador feito pelo backoffice (tela "Promover atleta a
 * organizador"), gravado em dois lugares por sensibilidade:
 *
 * - `users/{uid}.organizerProfile` — marca, cidade/UF e contatos. É o MESMO
 *   mapa que o organizador edita em /painel/config no portal dele, então os
 *   dois caminhos convergem em vez de criar cadastro paralelo. Esse doc é
 *   legível por qualquer autenticado quando a conta também é atleta, então
 *   nada sensível entra aqui.
 * - `organizers/{uid}` — documento, tipo de conta e condições comerciais.
 *   Admin-only na leitura e write-only por Cloud Function.
 *
 * Precisa ser callable: a rule de update de `users/{uid}` por terceiro exige
 * `isSuperAdmin()`, e o backoffice roda com admin comum.
 */

const MAX_TEXT = 200;
const ACCOUNT_TYPES = ["Pessoa física (CPF)", "Pessoa jurídica (CNPJ)"];
const UF_PATTERN = /^[A-Z]{2}$/;

function text(value: unknown, field: string, maxLength = MAX_TEXT): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `Campo '${field}' deve ser texto.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpsError("invalid-argument", `Campo '${field}' excede ${maxLength} caracteres.`);
  }
  return trimmed;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `Campo '${field}' deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

export const saveOrganizerRegistration = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const {uid} = request.data || {};
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }

  const auth = getAuth();
  let caller;
  try {
    caller = await auth.getUser(callerUid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      // Token ainda válido (JWT não expirou) mas a conta foi apagada depois
      // que o cliente o obteve — sessão órfã, não um erro interno real.
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o administrador da plataforma pode gravar o cadastro de um organizador.",
    );
  }

  // Falha aqui se o UID não existe, antes de gravar qualquer coisa.
  await auth.getUser(uid);

  const profileIn = record(request.data?.profile, "profile");
  const termsIn = record(request.data?.terms, "terms");

  const state = text(profileIn["state"], "profile.state", 2).toUpperCase();
  if (state && !UF_PATTERN.test(state)) {
    throw new HttpsError("invalid-argument", "UF inválida: use a sigla de duas letras.");
  }

  const accountType = text(termsIn["accountType"], "terms.accountType");
  if (accountType && !ACCOUNT_TYPES.includes(accountType)) {
    throw new HttpsError("invalid-argument", "Tipo de conta inválido.");
  }

  // A comissão nunca é aceita como veio: ela é descontada de dinheiro real na
  // confirmação do pagamento, então valor fora da faixa é recusado na entrada
  // (e o leitor da taxa valida de novo, por segurança).
  const commissionRaw = termsIn["commissionPercent"];
  if (typeof commissionRaw !== "number" || !isValidCommissionPercent(commissionRaw)) {
    throw new HttpsError("invalid-argument", "Comissão inválida.");
  }

  const permissionsRaw = termsIn["permissions"];
  const permissions = Array.isArray(permissionsRaw) ?
    permissionsRaw.filter((p): p is string => typeof p === "string").slice(0, 50) :
    [];

  const profile = {
    orgName: text(profileIn["orgName"], "profile.orgName"),
    contactEmail: text(profileIn["contactEmail"], "profile.contactEmail"),
    contactPhone: text(profileIn["contactPhone"], "profile.contactPhone", 20).replace(/\D/g, ""),
    city: text(profileIn["city"], "profile.city"),
    state,
  };

  const db = getFirestore();
  const batch = db.batch();

  // merge: `organizerProfile` também é editado pelo organizador no portal dele,
  // e o doc tem muito mais campos (perfil de atleta) que não são nossos.
  //
  // `hasOrganizerRole` NÃO entra aqui: é derivado de `roles` pelo trigger
  // `search-keywords-sync`, e escrevê-lo à mão marcaria como organizador uma
  // conta cuja atribuição de role tivesse falhado.
  batch.set(db.doc(`users/${uid}`), {organizerProfile: profile}, {merge: true});

  batch.set(
    db.doc(`organizers/${uid}`),
    {
      accountType,
      document: text(termsIn["document"], "terms.document", 40),
      commissionPercent: commissionRaw,
      payoutSchedule: text(termsIn["payoutSchedule"], "terms.payoutSchedule"),
      tournamentLimit: text(termsIn["tournamentLimit"], "terms.tournamentLimit"),
      permissions,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    },
    {merge: true},
  );

  await batch.commit();

  logger.info(
    `Cadastro de organizador gravado para ${uid} por ${callerUid} ` +
      `(comissão ${commissionRaw}%)`,
  );

  return {success: true};
});
