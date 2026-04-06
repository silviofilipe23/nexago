import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {setGlobalOptions} from "firebase-functions";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import webpush, {PushSubscription} from "web-push";
import {createHmac, createHash, randomBytes, timingSafeEqual} from "node:crypto";

// Initialize Firebase Admin
initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

/**
 * Helper function para obter o projectId do Firebase dinamicamente
 * Usa process.env.GCLOUD_PROJECT que é automaticamente definido pelo Firebase
 */
function getFirebaseProjectId(): string {
  // process.env.GCLOUD_PROJECT é automaticamente definido pelo Firebase Functions
  // Retorna o projectId do projeto onde a função está sendo executada
  return process.env.GCLOUD_PROJECT || 'volley-track-2dd3b'; // Fallback para produção
}

// Secret binding for production
const ADMIN_ELEVATE_SECRET = defineSecret("ADMIN_ELEVATE_SECRET");

// Cloudflare Turnstile (captcha) para formulário de contato
const TURNSTILE_SECRET = defineSecret("TURNSTILE_SECRET");

// Mercado Pago (marketplace / split)
const MERCADOPAGO_APP_ID = defineSecret("MERCADOPAGO_APP_ID");
const MERCADOPAGO_APP_SECRET = defineSecret("MERCADOPAGO_APP_SECRET");
const MERCADOPAGO_WEBHOOK_SECRET = defineSecret("MERCADOPAGO_WEBHOOK_SECRET");
const PLATFORM_FEE_FIXED_BRL = defineSecret("PLATFORM_FEE_FIXED_BRL");
const WEB_PUSH_PUBLIC_KEY = defineSecret("WEB_PUSH_PUBLIC_KEY");
const WEB_PUSH_PRIVATE_KEY = defineSecret("WEB_PUSH_PRIVATE_KEY");
const WEB_PUSH_SUBJECT = defineSecret("WEB_PUSH_SUBJECT");

interface StoredWebPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

let webPushConfigured = false;

function configureWebPushIfPossible(): boolean {
  if (webPushConfigured) {
    return true;
  }

  try {
    const publicKey = WEB_PUSH_PUBLIC_KEY.value();
    const privateKey = WEB_PUSH_PRIVATE_KEY.value();
    const subject = WEB_PUSH_SUBJECT.value() || "mailto:suporte@voleigo.com.br";
    if (!publicKey || !privateKey) {
      logger.warn("WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY não configuradas.");
      return false;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    webPushConfigured = true;
    return true;
  } catch (error) {
    logger.warn("Não foi possível configurar Web Push.", error);
    return false;
  }
}

async function getUserNotificationChannels(
  userId: string
): Promise<{ fcmTokens: string[]; webPushSubscriptions: StoredWebPushSubscription[] }> {
  const db = getFirestore();
  const [tokensSnapshot, webPushSnapshot] = await Promise.all([
    db.collection(`users/${userId}/tokens`).get(),
    db.collection(`users/${userId}/webPushSubscriptions`).get(),
  ]);

  const fcmTokens = tokensSnapshot.docs.map((doc) => doc.id);
  const webPushSubscriptions = webPushSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      const endpoint = data["endpoint"];
      const keys = data["keys"];
      if (
        typeof endpoint !== "string" ||
        !keys ||
        typeof keys["p256dh"] !== "string" ||
        typeof keys["auth"] !== "string"
      ) {
        return null;
      }

      return {
        id: doc.id,
        userId,
        endpoint,
        keys: {
          p256dh: keys["p256dh"],
          auth: keys["auth"],
        },
      } as StoredWebPushSubscription;
    })
    .filter((item): item is StoredWebPushSubscription => item !== null);

  return {fcmTokens, webPushSubscriptions};
}

async function sendWebPushToSubscriptions(
  subscriptions: StoredWebPushSubscription[],
  payload: Record<string, unknown>
): Promise<{sent: number; failed: number}> {
  if (subscriptions.length === 0) {
    return {sent: 0, failed: 0};
  }

  const enabled = configureWebPushIfPossible();
  if (!enabled) {
    logger.warn("Web Push não configurado: WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY ausentes ou inválidos");
    return {sent: 0, failed: subscriptions.length};
  }

  const db = getFirestore();
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription as PushSubscription, JSON.stringify(payload));
      sent += 1;
    } catch (error: any) {
      failed += 1;
      const statusCode = error?.statusCode as number | undefined;
      logger.warn(`Web Push falhou (status ${statusCode}):`, error?.message ?? error);
      if (statusCode === 404 || statusCode === 410) {
        try {
          await db.doc(`users/${subscription.userId}/webPushSubscriptions/${subscription.id}`).delete();
          logger.info(`WebPushSubscription inválida removida para usuário ${subscription.userId}`);
        } catch (cleanupError) {
          logger.warn("Erro ao remover webPushSubscription inválida", cleanupError);
        }
      }
    }
  }));

  return {sent, failed};
}

/**
 * Define ou atualiza o custom claim (role) de um usuário
 * Apenas usuários autenticados podem chamar esta função
 */
export const setUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }

  // Valida o role
  if (role !== "admin" && role !== "athlete" && role !== "arena") {
    throw new HttpsError("invalid-argument", "Role inválido. Use 'admin', 'athlete' ou 'arena'");
  }

  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const callerRole = callerUser.customClaims?.role;
  const isCallerAdmin = callerRole === "admin";
  const isCallerSuperAdmin = callerUser.customClaims?.superAdmin === true;
  const isSelf = callerUid === uid;

  // Usuário comum só pode definir o próprio role inicial como 'athlete'
  if (isSelf && !isCallerAdmin && role !== "athlete") {
    throw new HttpsError("permission-denied", "Permissão negada: não é permitido promover a própria conta");
  }

  // Definir role de terceiros exige admin
  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem definir roles de outros usuários");
  }

  // Apenas super admin pode atribuir role 'admin' ou 'arena' a terceiros
  if (!isSelf && (role === "admin" || role === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode cadastrar ou promover usuários a organizador (admin) ou gestor de arena (arena).");
  }

  try {
    // Faz merge para não remover claims existentes (ex.: athletePro, superAdmin)
    const targetUser = await auth.getUser(uid);
    const currentClaims = targetUser.customClaims || {};
    const claims: Record<string, unknown> = {...currentClaims, role};

    // Evita manter superAdmin em usuários sem role admin
    if (role !== "admin" && "superAdmin" in claims) {
      delete claims.superAdmin;
    }

    await auth.setCustomUserClaims(uid, claims);
    
    // Atualiza também no Firestore para manter sincronizado
    const db = getFirestore();
    await db.doc(`users/${uid}`).set({role}, {merge: true});
    
    logger.info(`Role ${role} definido para usuário ${uid} (custom claims + Firestore)`);
    
    return {success: true, role};
  } catch (error) {
    logger.error("Erro ao definir role:", error);
    throw new Error("Erro ao definir role do usuário");
  }
});

/**
 * Recebe mensagem de contato com token Turnstile; valida o captcha e grava em contactMessages.
 */
export const submitContactMessageSecure = onCall(
  {secrets: [TURNSTILE_SECRET]},
  async (request) => {
    try {
      const {name, email, subject, message, captchaToken} = request.data || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        throw new HttpsError("invalid-argument", "Nome é obrigatório.");
      }
      if (!email || typeof email !== "string" || !email.trim()) {
        throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
      }
      if (!subject || typeof subject !== "string" || !subject.trim()) {
        throw new HttpsError("invalid-argument", "Assunto é obrigatório.");
      }
      if (!message || typeof message !== "string" || !message.trim()) {
        throw new HttpsError("invalid-argument", "Mensagem é obrigatória.");
      }
      if (!captchaToken || typeof captchaToken !== "string" || !captchaToken.trim()) {
        throw new HttpsError("invalid-argument", "Validação de segurança (captcha) é obrigatória. Atualize a página e tente novamente.");
      }

      let secret: string;
      try {
        secret = TURNSTILE_SECRET.value() ?? "";
      } catch (e) {
        logger.error("TURNSTILE_SECRET não disponível", e);
        throw new HttpsError("failed-precondition", "Configuração de segurança indisponível. Configure TURNSTILE_SECRET nas Firebase Functions.");
      }
      if (!secret) {
        logger.error("TURNSTILE_SECRET está vazio");
        throw new HttpsError("failed-precondition", "Configuração de segurança indisponível. Configure o secret TURNSTILE_SECRET (ex.: firebase functions:secrets:set TURNSTILE_SECRET).");
      }

      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({secret, response: captchaToken.trim()}).toString()
      });
      if (!verifyRes.ok) {
        const text = await verifyRes.text();
        logger.warn("Turnstile verify request failed", verifyRes.status, text);
        throw new HttpsError("internal", "Não foi possível validar a segurança. Tente novamente.");
      }
      let verifyData: { success?: boolean };
      try {
        verifyData = (await verifyRes.json()) as { success?: boolean };
      } catch (e) {
        logger.error("Turnstile response não é JSON", e);
        throw new HttpsError("internal", "Resposta inválida do serviço de verificação. Tente novamente.");
      }
      if (!verifyData.success) {
        throw new HttpsError("invalid-argument", "Validação de segurança falhou. Tente novamente.");
      }

      const db = getFirestore();
      const docRef = await db.collection("contactMessages").add({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });
      logger.info("Contact message saved", {messageId: docRef.id});
      return {messageId: docRef.id};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("submitContactMessageSecure error", err);
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem. Tente novamente.";
      throw new HttpsError("internal", message);
    }
  }
);

/**
 * Cria um novo organizador (admin sem superAdmin).
 * Apenas usuários com custom claim superAdmin === true podem chamar.
 */
export const createOrganizer = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getAuth().getUser(callerUid);
  if (callerUser.customClaims?.superAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode cadastrar organizadores."
    );
  }

  const {email, fullName, temporaryPassword} = request.data || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Nome completo é obrigatório.");
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Senha temporária deve ter no mínimo 6 caracteres.");
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(email.trim());
    throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw err;
    }
  }

  const userRecord = await auth.createUser({
    email: email.trim(),
    password: temporaryPassword,
    displayName: fullName.trim()
  });
  const uid = userRecord.uid;

  await auth.setCustomUserClaims(uid, {role: "admin", mustChangePassword: true});

  const db = getFirestore();
  await db.doc(`users/${uid}`).set({
    uid,
    email: email.trim(),
    fullName: fullName.trim(),
    role: "admin",
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  logger.info(`Organizador criado: ${uid} (${email})`);
  return {uid, email: email.trim()};
});

/**
 * Cria um novo gestor de arena (arena).
 * Apenas usuários com custom claim superAdmin === true podem chamar.
 */
export const createArena = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getAuth().getUser(callerUid);
  if (callerUser.customClaims?.superAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode cadastrar gestores de arena."
    );
  }

  const {email, fullName, temporaryPassword, arenaName} = request.data || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Nome completo é obrigatório.");
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Senha temporária deve ter no mínimo 6 caracteres.");
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(email.trim());
    throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw err;
    }
  }

  const userRecord = await auth.createUser({
    email: email.trim(),
    password: temporaryPassword,
    displayName: fullName.trim()
  });
  const uid = userRecord.uid;

  await auth.setCustomUserClaims(uid, {role: "arena", mustChangePassword: true});

  const db = getFirestore();
  await db.doc(`users/${uid}`).set({
    uid,
    email: email.trim(),
    fullName: fullName.trim(),
    role: "arena",
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  // Cria documento da arena vinculada ao gestor
  const arenaRef = db.collection("arenas").doc();
  await arenaRef.set({
    id: arenaRef.id,
    name: arenaName && typeof arenaName === "string" ? arenaName.trim() : "Minha Arena",
    managerUserId: uid,
    status: "active",
    basePriceReais: 0,
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  logger.info(`Gestor de arena criado: ${uid} (${email})`);
  return {uid, email: email.trim(), arenaId: arenaRef.id};
});

/**
 * Remove a flag mustChangePassword do custom claim do usuário
 * Apenas o próprio usuário ou um admin pode chamar esta função
 */
export const clearMustChangePassword = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const {uid} = request.data || {};
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID é obrigatório");
  }

  // Verifica se o caller é o próprio usuário ou um admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerUser.customClaims?.role === "admin";
  const isSelf = callerUid === uid;

  if (!isAdmin && !isSelf) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas o próprio usuário ou um admin pode remover esta flag");
  }

  // Obtém os claims atuais do usuário
  const targetUser = await getAuth().getUser(uid);
  const currentClaims = targetUser.customClaims || {};

  // Remove mustChangePassword mantendo os outros claims
  const {mustChangePassword, ...remainingClaims} = currentClaims;

  // Atualiza os custom claims sem mustChangePassword
  await getAuth().setCustomUserClaims(uid, remainingClaims);

  logger.info(`Flag mustChangePassword removida para usuário ${uid}`);
  return {success: true};
});

/**
 * Obtém o role de um usuário pelos custom claims
 */
export const getUserRole = onCall(async (request) => {
  const {uid} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new Error("Usuário não autenticado");
  }

  // Usuário pode ver seu próprio role ou deve ser admin ou super admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerUser.customClaims?.role === "admin";
  const isSuperAdmin = callerUser.customClaims?.superAdmin === true;
  
  if (callerUid !== uid && !isAdmin && !isSuperAdmin) {
    throw new Error("Permissão negada");
  }

  try {
    const user = await getAuth().getUser(uid);
    return {role: user.customClaims?.role || null};
  } catch (error) {
    logger.error("Erro ao obter role:", error);
    throw new Error("Erro ao obter role do usuário");
  }
});

/**
 * Define ou atualiza o status PRO de um atleta
 * Apenas admins podem chamar
 */
export const setAthletePro = onCall(async (request) => {
  const {uid, isPro, expiresAt} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof isPro !== "boolean") {
    throw new HttpsError("invalid-argument", "isPro inválido");
  }
  if (expiresAt !== undefined && (typeof expiresAt !== "number" || Number.isNaN(expiresAt))) {
    throw new HttpsError("invalid-argument", "expiresAt inválido");
  }

  // Apenas admin pode alterar status PRO
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isAdmin = callerUser.customClaims?.role === "admin";

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada");
  }

  // Atualiza custom claims sem remover claims existentes
  const targetUser = await auth.getUser(uid);
  const claims: Record<string, unknown> = {...(targetUser.customClaims || {}), athletePro: isPro};
  if (expiresAt) {
    claims.athleteProExpiresAt = expiresAt;
  } else if (!isPro) {
    // Remove expiração se não é PRO
    claims.athleteProExpiresAt = null;
  }

  await auth.setCustomUserClaims(uid, claims);

  // Atualiza Firestore
  const db = getFirestore();
  const updateData: any = {
    isPro,
    updatedAt: FieldValue.serverTimestamp()
  };

  if (isPro && !expiresAt) {
    // Se está ativando PRO e não tem data de expiração, marca como ativado agora
    const proProfileRef = db.doc(`athlete_profiles/${uid}`);
    const proProfile = await proProfileRef.get();
    
    if (!proProfile.exists || !proProfile.data()?.proActivatedAt) {
      updateData.proActivatedAt = FieldValue.serverTimestamp();
    }
  }

  if (expiresAt) {
    updateData.subscriptionEndDate = new Date(expiresAt * 1000);
  }

  await db.doc(`athlete_profiles/${uid}`).set(updateData, {merge: true});

  logger.info(`Status PRO ${isPro ? 'ativado' : 'desativado'} para usuário ${uid}`);

  return {success: true, message: "Status PRO atualizado"};
});

/**
 * Eleva um usuário para admin em produção via HTTP protegido por segredo.
 * Uso: Enviar requisição HTTP com header 'X-Admin-Secret' e body JSON { uid: string }
 */
export const elevateToAdmin = onRequest({secrets: [ADMIN_ELEVATE_SECRET]}, async (req, res) => {
  try {
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

    if (providedSecret !== configuredSecret) {
      res.status(403).send("Forbidden");
      return;
    }

    const {uid} = req.body || {};
    if (!uid || typeof uid !== "string") {
      res.status(400).send("Body inválido: informe { uid }");
      return;
    }

    await getAuth().setCustomUserClaims(uid, {role: "admin", superAdmin: true});

    // Reflete no Firestore (users/{uid}.role = 'admin') sem sobrescrever outros campos
    const db = getFirestore();
    await db.doc(`users/${uid}`).set({role: "admin"}, {merge: true});

    logger.info(`Usuário ${uid} elevado a super admin (custom claims + Firestore)`);
    res.status(200).json({success: true, uid, role: "admin", superAdmin: true});
  } catch (err) {
    logger.error("Falha ao elevar admin:", err);
    res.status(500).send("Erro interno");
  }
});

/**
 * Envia notificação push para um usuário específico
 * Requer autenticação e permissão de admin
 */
export const sendNotification = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {userId, title, body, data, requireInteraction} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  // Verifica se o caller é admin ou arena (arena pode notificar atletas sobre cancelamento de reserva)
  const callerUser = await getAuth().getUser(callerUid);
  const role = callerUser.customClaims?.role as string | undefined;
  const canSend = role === "admin" || role === "arena";

  if (!canSend) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins e gestores de arena podem enviar notificações");
  }

  if (!userId || !title || !body) {
    throw new HttpsError("invalid-argument", "Parâmetros inválidos: userId, title e body são obrigatórios");
  }

  try {
    const db = getFirestore();
    const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(userId);
    if (fcmTokens.length === 0 && webPushSubscriptions.length === 0) {
      logger.warn(`Nenhum canal de push encontrado para o usuário ${userId}`);
      return {success: false, message: "Usuário não possui inscrições de push registradas"};
    }

    const messaging = getMessaging();

    // Prepara a mensagem
    const message = {
      notification: {
        title,
        body
      },
      data: data ? {
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {} as Record<string, string>),
        requireInteraction: requireInteraction ? "true" : "false"
      } : {
        requireInteraction: requireInteraction ? "true" : "false"
      },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "default",
          sound: "default"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            sound: "default"
          }
        }
      }
    };

    const fcmResults = await Promise.allSettled(
      fcmTokens.map((token) =>
        messaging.send({ ...message, token })
      )
    );

    let fcmSuccessful = 0;
    let fcmFailed = 0;
    for (let i = 0; i < fcmResults.length; i++) {
      const result = fcmResults[i];
      const token = fcmTokens[i];
      if (result.status === "fulfilled") {
        fcmSuccessful += 1;
      } else {
        fcmFailed += 1;
        const err = result.reason as { code?: string };
        const code = err?.code ?? "";
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/registration-token-not-found"
        ) {
          try {
            await db.doc(`users/${userId}/tokens/${token}`).delete();
            logger.info(`Token FCM inválido removido para usuário ${userId}`);
          } catch (cleanupErr) {
            logger.warn("Erro ao remover token FCM inválido", cleanupErr);
          }
        } else {
          logger.warn(`FCM send falhou para token (código ${code}):`, (err as Error)?.message ?? err);
        }
      }
    }

    const webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
      notification: {
        title,
        body,
      },
      data: data ? Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) : {},
      requireInteraction: !!requireInteraction,
    });

    const successful = fcmSuccessful + webPushResult.sent;
    const failed = fcmFailed + webPushResult.failed;

    logger.info(`Notificação enviada para ${userId}: ${successful} sucesso, ${failed} falhas`);

    // Salva a notificação no histórico do usuário
    if (successful > 0) {
      try {
        const notificationsRef = db.collection(`users/${userId}/notifications`);
        const notificationDoc = notificationsRef.doc();
        
        await notificationDoc.set({
          userId,
          title,
          body,
          type: data?.['type'] || 'general',
          data: data ? Object.keys(data).reduce((acc, key) => {
            acc[key] = String(data[key]);
            return acc;
          }, {} as Record<string, string>) : undefined,
          read: false,
          createdAt: new Date(),
          readAt: null
        });
        
        logger.info(`Notificação salva no histórico para ${userId}`);
      } catch (historyError) {
        logger.warn(`Erro ao salvar notificação no histórico para ${userId}:`, historyError);
        // Não falha a função se o histórico falhar
      }
    }

    return {
      success: successful > 0,
      sent: successful,
      failed,
      total: fcmTokens.length + webPushSubscriptions.length
    };
  } catch (error) {
    logger.error("Erro ao enviar notificação:", error);
    throw new Error("Erro ao enviar notificação");
  }
});

/**
 * Notifica o gestor da arena quando um atleta cria uma reserva.
 *
 * Segurança:
 * - Exige autenticação.
 * - Valida que o caller é o dono da reserva em `arenaBookings/{bookingId}`.
 * - Envia a notificação para `arenas/{arenaId}.managerUserId`.
 */
export const notifyArenaBookingCreated = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {bookingId} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!bookingId || typeof bookingId !== "string") {
    throw new HttpsError("invalid-argument", "Parâmetro inválido: bookingId é obrigatório");
  }

  const db = getFirestore();

  const bookingDoc = await db.collection("arenaBookings").doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingDoc.data() as {
    arenaId?: string;
    courtId?: string;
    athleteId?: string | null;
    date?: string;
    startTime?: string;
    endTime?: string;
  };

  const athleteId = typeof booking?.athleteId === "string" ? booking.athleteId : null;
  const arenaId = booking?.arenaId;

  if (!athleteId) {
    throw new HttpsError("failed-precondition", "Reserva não possui atleta associado");
  }

  if (athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o dono desta reserva");
  }

  if (!arenaId || typeof arenaId !== "string") {
    throw new HttpsError("failed-precondition", "Reserva não possui arenaId válido");
  }

  const arenaDoc = await db.collection("arenas").doc(arenaId).get();
  if (!arenaDoc.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }

  const arena = arenaDoc.data() as {
    name?: string;
    managerUserId?: string;
  };

  const arenaName = typeof arena?.name === "string" ? arena.name : "Arena";
  const arenaManagerUserId = typeof arena?.managerUserId === "string" ? arena.managerUserId : null;

  if (!arenaManagerUserId) {
    throw new HttpsError("failed-precondition", "Arena não possui managerUserId válido");
  }

  let formattedDate = typeof booking?.date === "string" ? booking.date : "";
  if (formattedDate) {
    const parsed = new Date(`${formattedDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      formattedDate = parsed.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  }

  const startTime = typeof booking?.startTime === "string" ? booking.startTime : "";
  const endTime = typeof booking?.endTime === "string" ? booking.endTime : "";

  const title = "Nova reserva";
  let courtName = "Quadra";
  const courtId = typeof booking?.courtId === "string" ? booking.courtId : "";
  if (courtId) {
    const courtDoc = await db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get();
    if (courtDoc.exists) {
      const court = courtDoc.data() as {name?: string};
      if (typeof court?.name === "string" && court.name.trim().length > 0) {
        courtName = court.name.trim();
      }
    }
  }
  const body = `Dia ${formattedDate} de  ${startTime} às ${endTime} na quadra ${courtName}.`;

  const notificationType = "arena_booking_created";
  const data: Record<string, string> = {
    type: notificationType,
    url: "/arena/calendar",
    athleteId,
    arenaName,
    date: typeof booking?.date === "string" ? booking.date : "",
    startTime,
    endTime,
  };

  // Push (quando houver inscrição cadastrada)
  const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(arenaManagerUserId);
  const messaging = getMessaging();

  const message = {
    notification: {title, body},
    data: {
      ...data,
      requireInteraction: "true",
    },
    android: {
      priority: "high" as const,
      notification: {
        channelId: "default",
        sound: "default",
      },
    },
    apns: {
      headers: {"apns-priority": "10"},
      payload: {
        aps: {sound: "default"},
      },
    },
  };

  const fcmResults =
    fcmTokens.length > 0
      ? await Promise.allSettled(fcmTokens.map((token) => messaging.send({...message, token})))
      : [];

  const fcmSuccessful = fcmResults.filter((r) => r.status === "fulfilled").length;
  const fcmFailed = fcmResults.filter((r) => r.status === "rejected").length;

  const webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
    notification: {title, body},
    data,
    requireInteraction: true,
  });

  const successful = fcmSuccessful + webPushResult.sent;
  const failed = fcmFailed + webPushResult.failed;

  // Histórico in-app (garante a exibição no app mesmo se não houver push configurado)
  try {
    const notificationsRef = db.collection(`users/${arenaManagerUserId}/notifications`);
    const notificationDoc = notificationsRef.doc();

    await notificationDoc.set({
      userId: arenaManagerUserId,
      title,
      body,
      type: notificationType,
      data,
      read: false,
      createdAt: new Date(),
      readAt: null,
    });
  } catch (historyError) {
    logger.warn("Erro ao salvar notificação no histórico:", historyError);
    // Não falha a função se o histórico falhar
  }

  logger.info(`Notificação criada para ${arenaManagerUserId}: ${successful} sucesso, ${failed} falhas`);

  return {
    success: true,
    sent: successful,
    failed,
    total: fcmTokens.length + webPushSubscriptions.length,
  };
});

/**
 * Envia notificação para múltiplos usuários (ex: todos os participantes de um torneio)
 */
export const sendBulkNotification = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {userIds, title, body, data, requireInteraction} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new Error("Usuário não autenticado");
  }

  // Verifica se o caller é admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerUser.customClaims?.role === "admin";

  if (!isAdmin) {
    throw new Error("Permissão negada: apenas admins podem enviar notificações");
  }

  if (!Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
    throw new Error("Parâmetros inválidos: userIds (array), title e body são obrigatórios");
  }

  try {
    const db = getFirestore();
    const messaging = getMessaging();
    
    const channelResults = await Promise.all(
      userIds.map(async (userId: string) => ({userId, ...(await getUserNotificationChannels(userId))}))
    );
    const allTokens = channelResults.flatMap((result) => result.fcmTokens);
    const allWebPushSubscriptions = channelResults.flatMap((result) => result.webPushSubscriptions);

    if (allTokens.length === 0 && allWebPushSubscriptions.length === 0) {
      logger.warn("Nenhum canal de push encontrado para os usuários especificados");
      return {success: false, message: "Nenhuma inscrição de push encontrada"};
    }

    // Prepara a mensagem
    const message = {
      notification: {
        title,
        body
      },
      data: data ? {
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {} as Record<string, string>),
        requireInteraction: requireInteraction ? "true" : "false"
      } : {
        requireInteraction: requireInteraction ? "true" : "false"
      },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "default",
          sound: "default"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            sound: "default"
          }
        }
      }
    };

    const results = await Promise.allSettled(
      allTokens.map(token => 
        messaging.send({
          ...message,
          token
        })
      )
    );

    const fcmSuccessful = results.filter(r => r.status === "fulfilled").length;
    const fcmFailed = results.filter(r => r.status === "rejected").length;

    const webPushResult = await sendWebPushToSubscriptions(allWebPushSubscriptions, {
      notification: {
        title,
        body,
      },
      data: data ? Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) : {},
      requireInteraction: !!requireInteraction,
    });

    const successful = fcmSuccessful + webPushResult.sent;
    const failed = fcmFailed + webPushResult.failed;

    logger.info(`Notificação em massa enviada: ${successful} sucesso, ${failed} falhas`);

    // Salva a notificação no histórico de cada usuário
    if (successful > 0) {
      const historyPromises = userIds.map(async (userId: string) => {
        try {
          const notificationsRef = db.collection(`users/${userId}/notifications`);
          const notificationDoc = notificationsRef.doc();
          
          await notificationDoc.set({
            userId,
            title,
            body,
            type: data?.['type'] || 'general',
            data: data ? Object.keys(data).reduce((acc, key) => {
              acc[key] = String(data[key]);
              return acc;
            }, {} as Record<string, string>) : undefined,
            read: false,
            createdAt: new Date(),
            readAt: null
          });
          
          logger.debug(`Notificação salva no histórico para ${userId}`);
        } catch (historyError) {
          logger.warn(`Erro ao salvar notificação no histórico para ${userId}:`, historyError);
          // Não falha se um histórico falhar
        }
      });

      await Promise.allSettled(historyPromises);
      logger.info(`Histórico de notificações atualizado para ${userIds.length} usuários`);
    }

    return {
      success: true,
      sent: successful,
      failed,
      total: allTokens.length + allWebPushSubscriptions.length
    };
  } catch (error) {
    logger.error("Erro ao enviar notificação em massa:", error);
    throw new Error("Erro ao enviar notificação em massa");
  }
});

/**
 * Cloud Function agendada para enviar lembretes de partidas
 * Executa a cada hora e verifica partidas que começam em 1 hora
 * 
 * Para ativar, configure no Firebase Console:
 * - Cloud Scheduler > Create Job
 * - Schedule: "0 * * * *" (a cada hora)
 * - Target: HTTP
 * - URL: https://us-central1-[PROJECT_ID].cloudfunctions.net/sendMatchReminders
 *   (Substitua [PROJECT_ID] pelo ID do projeto onde a função está deployada)
 */
export const sendMatchReminders = onRequest({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (req, res) => {
  try {
    const db = getFirestore();
    const messaging = getMessaging();
    const projectId = getFirebaseProjectId();
    
    // Busca todas as partidas agendadas para as próximas 1-2 horas
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const matchesRef = db.collection(`artifacts/${projectId}/public/data/matches`);
    const matchesSnapshot = await matchesRef
      .where('status', '==', 'Scheduled')
      .where('scheduleTime', '>=', oneHourFromNow)
      .where('scheduleTime', '<=', twoHoursFromNow)
      .get();

    if (matchesSnapshot.empty) {
      logger.info('Nenhuma partida encontrada para lembrete');
      res.status(200).json({ success: true, sent: 0 });
      return;
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const matchDoc of matchesSnapshot.docs) {
      const match = matchDoc.data();
      const matchId = matchDoc.id;

      // Verifica se já foi enviado lembrete (usando campo sentReminder)
      if (match.sentReminder) {
        continue;
      }

      try {
        // Busca times
        const [teamA, teamB] = await Promise.all([
          db.doc(`artifacts/${projectId}/public/data/teams/${match.teamAId}`).get(),
          db.doc(`artifacts/${projectId}/public/data/teams/${match.teamBId}`).get()
        ]);

        const teamAData = teamA.data();
        const teamBData = teamB.data();

        if (!teamAData || !teamBData) {
          continue;
        }

        // Coleta userIds
        const userIds = new Set<string>();
        if (teamAData.player1Id) userIds.add(teamAData.player1Id);
        if (teamAData.player2Id) userIds.add(teamAData.player2Id);
        if (teamBData.player1Id) userIds.add(teamBData.player1Id);
        if (teamBData.player2Id) userIds.add(teamBData.player2Id);

        if (userIds.size === 0) {
          continue;
        }

        const channelResults = await Promise.all(
          Array.from(userIds).map(async (userId) => ({userId, ...(await getUserNotificationChannels(userId))}))
        );
        const allTokens = channelResults.flatMap((result) => result.fcmTokens);
        const allWebPushSubscriptions = channelResults.flatMap((result) => result.webPushSubscriptions);

        if (allTokens.length === 0 && allWebPushSubscriptions.length === 0) {
          continue;
        }

        // Formata horário
        const scheduleTime = match.scheduleTime?.toDate() || new Date();
        const timeStr = scheduleTime.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        const teamAName = teamAData.teamName || 'Time A';
        const teamBName = teamBData.teamName || 'Time B';
        const courtName = match.courtName || 'Quadra';

        // Busca nome do torneio
        let tournamentName = 'Torneio';
        try {
          const tournamentDoc = await db.doc(`artifacts/${projectId}/public/data/tournaments/${match.tournamentId}`).get();
          if (tournamentDoc.exists) {
            const tournamentData = tournamentDoc.data();
            tournamentName = tournamentData?.['name'] || 'Torneio';
          }
        } catch (error) {
          logger.warn(`Erro ao buscar nome do torneio ${match.tournamentId}:`, error);
        }

        // Prepara mensagem
        const message = {
          notification: {
            title: '⏰ Lembrete: Partida em 1h',
            body: `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}`
          },
          data: {
            type: 'match_reminder',
            matchId,
            tournamentId: match.tournamentId,
            categoryId: match.categoryId,
            url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`
          },
          android: {
            priority: 'high' as const,
            notification: {
              channelId: 'default',
              sound: 'default'
            }
          },
          apns: {
            headers: {
              'apns-priority': '10'
            },
            payload: {
              aps: {
                sound: 'default'
              }
            }
          }
        };

        // Envia para todos os tokens
        const results = await Promise.allSettled(
          allTokens.map(token =>
            messaging.send({
              ...message,
              token
            })
          )
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - successful;
        const webPushResult = await sendWebPushToSubscriptions(allWebPushSubscriptions, {
          notification: {
            title: '⏰ Lembrete: Partida em 1h',
            body: `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}`,
          },
          data: {
            type: 'match_reminder',
            matchId,
            tournamentId: String(match.tournamentId),
            categoryId: String(match.categoryId),
            url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`,
          },
          requireInteraction: false,
        });

        totalSent += successful + webPushResult.sent;
        totalFailed += failed + webPushResult.failed;

        // Salva a notificação no histórico de cada usuário
        if (successful > 0 || webPushResult.sent > 0) {
          const historyPromises = Array.from(userIds).map(async (userId: string) => {
            try {
              const notificationsRef = db.collection(`users/${userId}/notifications`);
              const notificationDoc = notificationsRef.doc();
              
              await notificationDoc.set({
                userId,
                title: '⏰ Lembrete: Partida em 1h',
                body: `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}\n${tournamentName}`,
                type: 'match_reminder',
                data: {
                  matchId,
                  tournamentId: match.tournamentId,
                  categoryId: match.categoryId,
                  hoursBefore: '1',
                  url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`
                },
                read: false,
                createdAt: new Date(),
                readAt: null
              });
            } catch (historyError) {
              logger.warn(`Erro ao salvar lembrete no histórico para ${userId}:`, historyError);
            }
          });

          await Promise.allSettled(historyPromises);
        }

        // Marca que o lembrete foi enviado
        await matchDoc.ref.update({ sentReminder: true });

      } catch (error) {
        logger.error(`Erro ao processar partida ${matchId}:`, error);
        totalFailed++;
      }
    }

    logger.info(`Lembretes enviados: ${totalSent} sucesso, ${totalFailed} falhas`);
    res.status(200).json({ success: true, sent: totalSent, failed: totalFailed });
  } catch (error) {
    logger.error('Erro ao enviar lembretes:', error);
    res.status(500).json({ success: false, error: 'Erro ao enviar lembretes' });
  }
});

// ---------- Mercado Pago (marketplace / split) ----------

const MP_OAUTH_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const MP_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";
const MP_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";
/** URL de autorização OAuth (documentação oficial usa auth.mercadopago.com). */
const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";

/** Origens permitidas para callables do Mercado Pago (evita CORS no browser). */
const MP_CORS_ORIGINS = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://voleigo.com.br",
  "https://www.voleigo.com.br",
  /^https:\/\/[^/]+\.web\.app$/,
  /^https:\/\/[^/]+\.firebaseapp\.com$/,
];

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildPkcePair(): {codeVerifier: string; codeChallenge: string} {
  // RFC 7636: code_verifier with high entropy and URL-safe characters
  const codeVerifier = toBase64Url(randomBytes(64));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  return {codeVerifier, codeChallenge};
}

type MercadoPagoSignature = {ts: string; v1: string};

function parseMercadoPagoSignature(headerValue: string): MercadoPagoSignature | null {
  const raw = (headerValue || "").trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(",");
  let ts = "";
  let v1 = "";

  for (const part of parts) {
    const [keyRaw, valueRaw] = part.split("=", 2);
    const key = (keyRaw || "").trim();
    const value = (valueRaw || "").trim();
    if (!key || !value) {
      continue;
    }
    if (key === "ts") {
      ts = value;
    } else if (key === "v1") {
      v1 = value.toLowerCase();
    }
  }

  if (!ts || !v1) {
    return null;
  }
  return {ts, v1};
}

function normalizeWebhookDataId(dataId: string): string {
  const normalized = dataId.trim();
  // Conforme guia do Mercado Pago, ids alfanuméricos na URL devem ir em minúsculo.
  if (/^[a-z0-9]+$/i.test(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function verifyMercadoPagoWebhookSignature(input: {
  secret: string;
  xSignatureHeader: string;
  xRequestIdHeader: string;
  dataIdFromQuery?: string;
}): boolean {
  const parsed = parseMercadoPagoSignature(input.xSignatureHeader);
  if (!parsed) {
    return false;
  }

  let manifest = "";
  if (input.dataIdFromQuery) {
    manifest += `id:${normalizeWebhookDataId(input.dataIdFromQuery)};`;
  }
  manifest += `request-id:${input.xRequestIdHeader};`;
  manifest += `ts:${parsed.ts};`;

  try {
    const expected = createHmac("sha256", input.secret)
      .update(manifest)
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(parsed.v1, "hex");
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifica se o organizador já vinculou a conta Mercado Pago (para exibir "Conta vinculada" no perfil).
 */
export const getMercadoPagoStatus = onCall({
  secrets: [MERCADOPAGO_APP_ID],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    return { linked: false };
  }
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}/mercadopago/credentials`).get();
  const data = snap.data();
  return { linked: !!(data?.access_token) };
});

/**
 * Retorna a URL de autorização OAuth do Mercado Pago para o organizador vincular a conta.
 * Redirect URI deve apontar para mercadopagoOAuthCallback (HTTP).
 */
export const getMercadoPagoAuthUrl = onCall({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new Error("Usuário não autenticado");
  }
  const callerUser = await getAuth().getUser(uid);
  if (callerUser.customClaims?.role !== "admin") {
    throw new Error("Apenas organizadores podem vincular conta Mercado Pago");
  }
  const appId = MERCADOPAGO_APP_ID.value();
  if (!appId) {
    throw new Error("MERCADOPAGO_APP_ID não configurado");
  }
  // Log seguro: só mascarado para conferir qual App ID está em uso (nunca logar secret)
  const mask = (s: string) => s.length <= 8 ? "***" : s.slice(0, 4) + "…" + s.slice(-4);
  logger.info(`getMercadoPagoAuthUrl: MERCADOPAGO_APP_ID em uso appIdMasked=${mask(appId)} appIdLength=${appId.length}`);
  const projectId = getFirebaseProjectId();
  const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/mercadopagoOAuthCallback`;
  const {codeVerifier, codeChallenge} = buildPkcePair();
  const db = getFirestore();
  await db.doc(`users/${uid}/mercadopago/oauthPkce`).set({
    codeVerifier,
    createdAt: FieldValue.serverTimestamp(),
  });
  // Mantém o authorize com parâmetros mínimos para evitar 400 por escopo incompatível.
  const url = `${MP_AUTH_URL}?client_id=${encodeURIComponent(appId)}&response_type=code&platform_id=mp&state=${encodeURIComponent(uid)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
  return { url };
});

/**
 * Callback OAuth do Mercado Pago: troca code por tokens e grava em users/{managerId}/mercadopago/credentials.
 * Redireciona para o app com ?mp=success ou ?mp=error.
 */
export const mercadopagoOAuthCallback = onRequest({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET],
}, async (req, res) => {
  const projectId = getFirebaseProjectId();
  const appUrl = `https://voleigo.com.br`; // Ajuste se o app tiver URL diferente
  const code = req.query?.code as string | undefined;
  const state = req.query?.state as string | undefined; // managerId (uid)
  const errorQuery = req.query?.error as string | undefined;

  if (errorQuery) {
    logger.warn("Mercado Pago OAuth error:", errorQuery);
    const reason = errorQuery === "access_denied" ? "access_denied" : "oauth_error";
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=${encodeURIComponent(reason)}`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=no_code`);
    return;
  }

  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    logger.warn(`mercadopagoOAuthCallback: credenciais ausentes hasAppId=${!!appId} hasAppSecret=${!!appSecret}`);
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=config`);
    return;
  }
  // Log seguro: App ID mascarado; Client Secret nunca logado (só comprimento)
  const mask = (s: string) => s.length <= 8 ? "***" : s.slice(0, 4) + "…" + s.slice(-4);
  logger.info(`mercadopagoOAuthCallback: credenciais em uso appIdMasked=${mask(appId)} appIdLength=${appId.length} appSecretLength=${appSecret.length}`);

  const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/mercadopagoOAuthCallback`;
  const db = getFirestore();
  const pkceRef = db.doc(`users/${state}/mercadopago/oauthPkce`);
  const pkceSnap = await pkceRef.get();
  const codeVerifier = pkceSnap.data()?.["codeVerifier"];
  if (!codeVerifier || typeof codeVerifier !== "string") {
    logger.warn(`mercadopagoOAuthCallback: PKCE ausente para uid=${state}`);
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=pkce_missing`);
    return;
  }
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  try {
    const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error("MP OAuth token exchange failed:", tokenRes.status, errText);
      const reason = tokenRes.status === 401 ? "token_failed_invalid_client" : `token_failed_${tokenRes.status}`;
      res.redirect(`${appUrl}/admin/profile?mp=error&reason=${encodeURIComponent(reason)}`);
      return;
    }
    const data = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      public_key?: string;
    };
    const expiresAt = Date.now() + (data.expires_in * 1000);
    await db.doc(`users/${state}/mercadopago/credentials`).set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      public_key: data.public_key || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await pkceRef.delete().catch(() => undefined);
    logger.info(`Mercado Pago vinculado para usuário ${state}`);
    res.redirect(`${appUrl}/admin/profile?mp=success`);
  } catch (e) {
    logger.error("mercadopagoOAuthCallback error:", e);
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=exception`);
  }
});

/**
 * Refresh do access_token do organizador usando refresh_token.
 */
async function refreshMercadoPagoToken(managerId: string): Promise<string> {
  const db = getFirestore();
  const docSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
  const creds = docSnap.data();
  if (!creds?.refresh_token) {
    throw new Error("Organizador ainda não vinculou conta Mercado Pago");
  }
  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    throw new Error("Configuração Mercado Pago incompleta");
  }
  const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "refresh_token",
      refresh_token: String(creds.refresh_token),
    }).toString(),
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    logger.error("MP refresh token failed:", tokenRes.status, errText);
    throw new Error("Falha ao renovar token Mercado Pago");
  }
  const data = await tokenRes.json() as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + (data.expires_in * 1000);
  await db.doc(`users/${managerId}/mercadopago/credentials`).update({
    access_token: data.access_token,
    expires_at: expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return data.access_token;
}

/**
 * Cria preferência de pagamento no Mercado Pago (split: organizador recebe, plataforma fica com taxa).
 * amountType: 'share' = parcela (entryFee/2), 'full' = valor total da equipe.
 */
export const createMercadoPagoPreference = onCall({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET, PLATFORM_FEE_FIXED_BRL],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }

    const { registrationId, amountType } = request.data as { registrationId?: string; amountType?: "share" | "full" };
    if (!registrationId || !amountType || (amountType !== "share" && amountType !== "full")) {
      throw new HttpsError("invalid-argument", "Parâmetros inválidos: registrationId e amountType ('share' ou 'full') são obrigatórios");
    }

    const projectId = getFirebaseProjectId();
    const db = getFirestore();
    const inscriptionsRef = db.collection(`artifacts/${projectId}/public/data/inscriptions`);
    const registrationSnap = await inscriptionsRef.doc(registrationId).get();
    if (!registrationSnap.exists) {
      throw new HttpsError("not-found", "Inscrição não encontrada");
    }
    const registration = registrationSnap.data()!;
    if (registration.isPaid === true) {
      throw new HttpsError("failed-precondition", "Esta inscrição já foi paga");
    }

    const teamId = registration.teamId as string;
    const tournamentId = registration.tournamentId as string;
    const categoryId = registration.categoryId as string;

    const teamSnap = await db.doc(`artifacts/${projectId}/public/data/teams/${teamId}`).get();
    if (!teamSnap.exists) {
      throw new HttpsError("not-found", "Equipe não encontrada");
    }
    const team = teamSnap.data()!;
    if (team.player1Id !== uid && team.player2Id !== uid) {
      throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
    }

    // Torneio: tentar root "tournaments" e depois artifacts (compatível com ambos os layouts)
    let tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tournamentSnap.exists) {
      tournamentSnap = await db.doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`).get();
    }
    if (!tournamentSnap.exists) {
      throw new HttpsError("not-found", "Torneio não encontrado");
    }
    const tournament = tournamentSnap.data()!;
    const managerId = tournament.managerId as string;
    const categories = (tournament.categories || []) as Array<{ categoryName: string; entryFee: number }>;
    const category = categories.find((c: { categoryName: string }) => c.categoryName === categoryId);
    const entryFee = category?.entryFee ?? 0;
    if (entryFee <= 0) {
      throw new HttpsError("failed-precondition", "Categoria sem taxa de inscrição");
    }

    const teamSize = 2; // equipes
    let amount: number;
    if (amountType === "full") {
      amount = entryFee;
    } else {
      amount = Math.round((entryFee / teamSize) * 100) / 100;
    }
    if (amount <= 0) {
      throw new HttpsError("failed-precondition", "Valor a pagar inválido");
    }

    const mpCredsSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
    const mpCreds = mpCredsSnap.data();
    if (!mpCreds?.access_token) {
      throw new HttpsError("failed-precondition", "Organizador ainda não vinculou conta Mercado Pago. O pagamento online estará disponível após a vinculação.");
    }

    let accessToken = mpCreds.access_token as string;
    const expiresAt = mpCreds.expires_at as number | undefined;
    if (expiresAt != null && Date.now() >= expiresAt - 60000) {
      accessToken = await refreshMercadoPagoToken(managerId);
    }

    let platformFeeBrl = 2;
    try {
      const feeVal = PLATFORM_FEE_FIXED_BRL.value();
      if (feeVal != null && feeVal !== "") {
        platformFeeBrl = Number(feeVal) || 2;
      }
    } catch {
      // secret não configurado: usa padrão
    }
    const platformFee = Math.min(platformFeeBrl, amount - 0.01);
    const tournamentName = (tournament.name as string) || "Torneio";
    const title = amountType === "full"
      ? `Inscrição completa - ${tournamentName} - ${categoryId}`
      : `Parcela da inscrição - ${tournamentName} - ${categoryId}`;

    const projectIdForUrl = getFirebaseProjectId();
    const baseUrl = `https://us-central1-${projectIdForUrl}.cloudfunctions.net`;
    const notificationUrl = `${baseUrl}/mercadopagoWebhook`;
    const backSuccess = `https://${projectIdForUrl}.web.app/athlete/register/success?paid=success`;
    const backPending = `https://${projectIdForUrl}.web.app/athlete/register/success?paid=pending`;
    const backFailure = `https://${projectIdForUrl}.web.app/athlete/register/success?paid=failure`;

    // Qualidade da integração MP: items com quantity e unit_price explícitos; back_urls para redirecionar ao concluir
    const unitPrice = Number(amount);
    const preferenceBody = {
      items: [{
        title,
        quantity: 1,
        unit_price: unitPrice,
        currency_id: "BRL",
      }],
      external_reference: registrationId,
      notification_url: notificationUrl,
      back_urls: {
        success: backSuccess,
        pending: backPending,
        failure: backFailure,
      },
      auto_return: "all" as const,
      marketplace_fee: platformFee,
    };

    const prefRes = await fetch(MP_PREFERENCES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!prefRes.ok) {
      const errText = await prefRes.text();
      logger.error("MP create preference failed:", prefRes.status, errText);
      throw new HttpsError("internal", "Não foi possível gerar o link de pagamento. Tente novamente.");
    }
    const prefData = await prefRes.json() as { init_point?: string };
    if (!prefData.init_point) {
      throw new HttpsError("internal", "Resposta inválida do Mercado Pago");
    }
    return { initPoint: prefData.init_point };
  } catch (err) {
    if (err instanceof HttpsError) {
      throw err;
    }
    if (err instanceof Error) {
      logger.warn("createMercadoPagoPreference:", err.message);
      throw new HttpsError("internal", err.message);
    }
    logger.error("createMercadoPagoPreference unexpected error:", err);
    throw new HttpsError("internal", "Erro ao gerar pagamento. Tente novamente.");
  }
});

/**
 * Webhook do Mercado Pago: ao receber notificação de pagamento aprovado, soma valor em paidAmount e marca isPaid se atingir entryFee.
 */
export const mercadopagoWebhook = onRequest({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET, MERCADOPAGO_WEBHOOK_SECRET, PLATFORM_FEE_FIXED_BRL],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const webhookSecret = MERCADOPAGO_WEBHOOK_SECRET.value();
  if (!webhookSecret) {
    logger.error("MERCADOPAGO_WEBHOOK_SECRET não configurado.");
    res.status(500).send("Config error");
    return;
  }

  const xSignature = req.get("x-signature") || "";
  const xRequestId = req.get("x-request-id") || "";
  const rawDataIdQuery = req.query["data.id"];
  const dataIdFromQuery =
    typeof rawDataIdQuery === "string" ? rawDataIdQuery :
      (Array.isArray(rawDataIdQuery) && typeof rawDataIdQuery[0] === "string" ? rawDataIdQuery[0] : undefined);

  if (!xSignature || !xRequestId) {
    logger.warn("Webhook MP sem headers de assinatura obrigatórios.");
    res.status(401).send("Unauthorized");
    return;
  }

  const signatureOk = verifyMercadoPagoWebhookSignature({
    secret: webhookSecret,
    xSignatureHeader: xSignature,
    xRequestIdHeader: xRequestId,
    dataIdFromQuery,
  });
  if (!signatureOk) {
    logger.warn("Webhook MP com assinatura inválida.");
    res.status(401).send("Unauthorized");
    return;
  }

  let body: { type?: string; data?: { id?: string } | string };
  try {
    if (typeof req.body === "string") {
      body = JSON.parse(req.body) as { type?: string; data?: { id?: string } | string };
    } else if (req.body && typeof req.body === "object") {
      body = req.body as { type?: string; data?: { id?: string } | string };
      if (typeof body.data === "string") {
        body.data = JSON.parse(body.data) as { id?: string };
      }
    } else {
      body = {};
    }
  } catch {
    res.status(400).send("Bad Request");
    return;
  }
  const dataObj = body?.data && typeof body.data === "object" ? body.data : undefined;
  if (body?.type !== "payment" || !dataObj?.id) {
    res.status(200).send("OK");
    return;
  }

  const paymentId = String(dataObj.id);
  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const processedRef = db.doc(`artifacts/${projectId}/public/data/mp_processed_payments/${paymentId}`);
  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    res.status(200).send("OK");
    return;
  }

  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    res.status(500).send("Config error");
    return;
  }

  const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "client_credentials",
    }).toString(),
  });
  if (!tokenRes.ok) {
    logger.error("MP client_credentials failed:", await tokenRes.text());
    res.status(500).send("Token error");
    return;
  }
  const tokenData = await tokenRes.json() as { access_token: string };
  const appToken = tokenData.access_token;

  const payRes = await fetch(`${MP_PAYMENTS_URL}/${paymentId}`, {
    headers: { "Authorization": `Bearer ${appToken}` },
  });
  if (!payRes.ok) {
    logger.warn("MP get payment failed:", payRes.status);
    res.status(200).send("OK");
    return;
  }
  const payment = await payRes.json() as { status?: string; external_reference?: string; transaction_amount?: number };
  if (payment.status !== "approved") {
    res.status(200).send("OK");
    return;
  }

  const registrationId = payment.external_reference;
  const paymentAmount = Number(payment.transaction_amount) || 0;
  if (!registrationId || paymentAmount <= 0) {
    res.status(200).send("OK");
    return;
  }

  const registrationRef = db.doc(`artifacts/${projectId}/public/data/inscriptions/${registrationId}`);
  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    res.status(200).send("OK");
    return;
  }

  const regData = registrationSnap.data()!;
  const tournamentId = regData.tournamentId as string;
  const categoryId = regData.categoryId as string;
  let entryFee = 0;
  let tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    tournamentSnap = await db.doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`).get();
  }
  if (tournamentSnap.exists) {
    const categories = (tournamentSnap.data()?.categories || []) as Array<{ categoryName: string; entryFee: number }>;
    const cat = categories.find((c: { categoryName: string }) => c.categoryName === categoryId);
    entryFee = cat?.entryFee ?? 0;
  }

  const currentPaid = Number(regData.paidAmount) || 0;
  const newPaidAmount = Math.round((currentPaid + paymentAmount) * 100) / 100;
  const reachedFullAmount = entryFee > 0 && newPaidAmount >= entryFee - 0.01;
  const isPaid = reachedFullAmount ? true : (regData.isPaid === true);

  await registrationRef.update({
    paidAmount: newPaidAmount,
    isPaid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await processedRef.set({ registrationId, processedAt: FieldValue.serverTimestamp() });

  logger.info(`MP webhook: registration ${registrationId} paidAmount=${newPaidAmount} isPaid=${isPaid}`);
  res.status(200).send("OK");
});
