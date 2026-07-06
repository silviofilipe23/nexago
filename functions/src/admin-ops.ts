import {getAuth} from "firebase-admin/auth";
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore} from "firebase-admin/firestore";
import {createHash, timingSafeEqual} from "node:crypto";

import {
  rolesFromClaims,
  uniqueSortedRoles,
  applyRolesToClaims,
  firestoreRolesPayload,
} from "./auth-roles";

const ADMIN_ELEVATE_SECRET = defineSecret("ADMIN_ELEVATE_SECRET");

/**
 * Eleva um usuário para admin (bootstrap do PRIMEIRO super admin).
 * DESLIGADO por padrão: exige env ADMIN_ELEVATE_ENABLED=true além do segredo.
 * Promoções do dia a dia usam setUserRole/addUserRole (callables com checagem
 * de super admin). Uso: POST com header 'X-Admin-Secret' e body { uid }.
 */
export const elevateToAdmin = onRequest({secrets: [ADMIN_ELEVATE_SECRET]}, async (req, res) => {
  try {
    if (process.env.ADMIN_ELEVATE_ENABLED !== "true") {
      res.status(404).send("Not Found");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const providedSecret = req.header("X-Admin-Secret") || "";
    const configuredSecret = ADMIN_ELEVATE_SECRET.value() || "";

    if (!configuredSecret) {
      logger.error("ADMIN_ELEVATE_SECRET não configurado");
      res.status(500).send("Configuração de segredo ausente");
      return;
    }

    // Digests de tamanho fixo permitem comparação em tempo constante.
    const providedDigest = createHash("sha256").update(providedSecret).digest();
    const configuredDigest =
      createHash("sha256").update(configuredSecret).digest();
    if (!timingSafeEqual(providedDigest, configuredDigest)) {
      res.status(403).send("Forbidden");
      return;
    }

    const {uid} = req.body || {};
    if (!uid || typeof uid !== "string") {
      res.status(400).send("Body inválido: informe { uid }");
      return;
    }

    const authSvc = getAuth();
    const existing = await authSvc.getUser(uid);
    const prevClaims = (existing.customClaims || {}) as Record<string, unknown>;
    const nextRoles = uniqueSortedRoles([...rolesFromClaims(prevClaims), "admin"]);
    const newClaims = applyRolesToClaims(prevClaims, nextRoles);
    newClaims["superAdmin"] = true;
    await authSvc.setCustomUserClaims(uid, newClaims);

    const db = getFirestore();
    await db.doc(`users/${uid}`).set(firestoreRolesPayload(nextRoles), {merge: true});

    logger.info(`Usuário ${uid} elevado a super admin (custom claims + Firestore)`);
    res.status(200).json({success: true, uid, roles: nextRoles, role: "admin", superAdmin: true});
  } catch (err) {
    logger.error("Falha ao elevar admin:", err);
    res.status(500).send("Erro interno");
  }
});