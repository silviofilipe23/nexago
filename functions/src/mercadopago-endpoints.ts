import {getAuth} from "firebase-admin/auth";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {createHash, randomBytes, timingSafeEqual, createHmac} from "node:crypto";

import {callerCanLinkMercadoPago} from "./auth-roles";
import {
  ARENA_BOOKING_MP_REF_PREFIX,
  processArenaBookingMercadoPagoNotification,
} from "./mercadopago-arena-booking-webhook";
import {getFirebaseProjectId} from "./firebase-paths";

// Segredos do Mercado Pago (marketplace / split)
const MERCADOPAGO_APP_ID = defineSecret("MERCADOPAGO_APP_ID");
const MERCADOPAGO_APP_SECRET = defineSecret("MERCADOPAGO_APP_SECRET");
const MERCADOPAGO_WEBHOOK_SECRET = defineSecret("MERCADOPAGO_WEBHOOK_SECRET");
const PLATFORM_FEE_FIXED_BRL = defineSecret("PLATFORM_FEE_FIXED_BRL");

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
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const callerUser = await getAuth().getUser(uid);
  if (!callerCanLinkMercadoPago(callerUser)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas gestores de arena ou administradores podem vincular Mercado Pago.",
    );
  }
  const payload = (request.data ?? {}) as {redirectTarget?: string};
  const redirectTarget =
    payload.redirectTarget === "app" ? "app" : "web";
  const appId = MERCADOPAGO_APP_ID.value();
  if (!appId) {
    throw new HttpsError("failed-precondition", "MERCADOPAGO_APP_ID não configurado");
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
    redirectTarget,
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
function mercadoPagoOAuthReturnBase(
  redirectTarget: string | undefined,
): string {
  if (redirectTarget === "app") {
    return "nexago://mercadopago";
  }
  return "https://voleigo.com.br/admin/profile";
}

export const mercadopagoOAuthCallback = onRequest({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET],
}, async (req, res) => {
  const projectId = getFirebaseProjectId();
  const code = req.query?.code as string | undefined;
  const state = req.query?.state as string | undefined; // managerId (uid)
  const errorQuery = req.query?.error as string | undefined;
  const db = getFirestore();
  const pkceRef = state ?
    db.doc(`users/${state}/mercadopago/oauthPkce`) :
    null;
  const pkceSnap = pkceRef ? await pkceRef.get() : null;
  const redirectTarget = pkceSnap?.data()?.["redirectTarget"] as string | undefined;
  const returnBase = mercadoPagoOAuthReturnBase(redirectTarget);

  if (errorQuery) {
    logger.warn("Mercado Pago OAuth error:", errorQuery);
    const reason = errorQuery === "access_denied" ? "access_denied" : "oauth_error";
    res.redirect(`${returnBase}?mp=error&reason=${encodeURIComponent(reason)}`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${returnBase}?mp=error&reason=no_code`);
    return;
  }

  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    logger.warn(`mercadopagoOAuthCallback: credenciais ausentes hasAppId=${!!appId} hasAppSecret=${!!appSecret}`);
    res.redirect(`${returnBase}?mp=error&reason=config`);
    return;
  }
  // Log seguro: App ID mascarado; Client Secret nunca logado (só comprimento)
  const mask = (s: string) => s.length <= 8 ? "***" : s.slice(0, 4) + "…" + s.slice(-4);
  logger.info(`mercadopagoOAuthCallback: credenciais em uso appIdMasked=${mask(appId)} appIdLength=${appId.length} appSecretLength=${appSecret.length}`);

  const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/mercadopagoOAuthCallback`;
  if (!pkceRef || !pkceSnap?.exists) {
    logger.warn(`mercadopagoOAuthCallback: PKCE doc ausente para uid=${state}`);
    res.redirect(`${returnBase}?mp=error&reason=pkce_missing`);
    return;
  }
  const codeVerifier = pkceSnap.data()?.["codeVerifier"];
  if (!codeVerifier || typeof codeVerifier !== "string") {
    logger.warn(`mercadopagoOAuthCallback: PKCE ausente para uid=${state}`);
    res.redirect(`${returnBase}?mp=error&reason=pkce_missing`);
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
      res.redirect(`${returnBase}?mp=error&reason=${encodeURIComponent(reason)}`);
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
    res.redirect(`${returnBase}?mp=success`);
  } catch (e) {
    logger.error("mercadopagoOAuthCallback error:", e);
    res.redirect(`${returnBase}?mp=error&reason=exception`);
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
 * Gera preferência de pagamento Mercado Pago para uma reserva em `arenaBookings`.
 *
 * Entrada: `bookingId`, `userId`, `valor` (deve bater com `amountReais` da reserva).
 * - Valida autenticação e que o atleta é dono da reserva.
 * - Usa o token OAuth do gestor da arena (`arenas/{arenaId}.managerUserId`).
 * - Grava em `arenaBookings/{id}`: `paymentId` (id da preferência MP), `paymentStatus: "pending"`.
 * - Retorna `initPoint` (URL do checkout).
 */
export const createArenaBookingMercadoPagoPayment = onCall({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET, PLATFORM_FEE_FIXED_BRL],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const data = request.data as { bookingId?: string; userId?: string; valor?: number };
  const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  const valorRaw = data.valor;

  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório");
  }
  if (!userId || userId !== callerUid) {
    throw new HttpsError("permission-denied", "userId deve ser o usuário autenticado");
  }
  if (typeof valorRaw !== "number" || !Number.isFinite(valorRaw) || valorRaw <= 0) {
    throw new HttpsError("invalid-argument", "valor deve ser um número positivo");
  }

  const db = getFirestore();
  const bookingRef = db.collection("arenaBookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingSnap.data()!;
  const athleteId = booking.athleteId as string | undefined;
  if (!athleteId || athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o titular desta reserva");
  }

  const expectedAmount = Number(booking.amountReais);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw new HttpsError("failed-precondition", "Reserva sem valor válido (amountReais)");
  }

  const valor = Math.round(valorRaw * 100) / 100;
  const expected = Math.round(expectedAmount * 100) / 100;
  if (Math.abs(valor - expected) > 0.02) {
    throw new HttpsError(
      "invalid-argument",
      `Valor não confere com a reserva (esperado R$ ${expected.toFixed(2)})`,
    );
  }

  const existingPaymentStatus = (booking.paymentStatus as string | undefined)?.toLowerCase();
  if (existingPaymentStatus === "paid" || existingPaymentStatus === "approved") {
    throw new HttpsError("failed-precondition", "Esta reserva já foi paga");
  }

  const arenaId = booking.arenaId as string | undefined;
  if (!arenaId) {
    throw new HttpsError("failed-precondition", "Reserva sem arenaId");
  }

  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }
  const arena = arenaSnap.data()!;
  const managerId = arena.managerUserId as string | undefined;
  if (!managerId) {
    throw new HttpsError(
      "failed-precondition",
      "Arena sem gestor vinculado; pagamento online indisponível.",
    );
  }

  const mpCredsSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
  const mpCreds = mpCredsSnap.data();
  if (!mpCreds?.access_token) {
    throw new HttpsError(
      "failed-precondition",
      "A arena ainda não configurou recebimento via Mercado Pago.",
    );
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
    // secret ausente
  }
  const amount = expected;
  const platformFee = Math.min(platformFeeBrl, amount - 0.01);

  const projectIdForUrl = getFirebaseProjectId();
  const baseUrl = `https://us-central1-${projectIdForUrl}.cloudfunctions.net`;
  const notificationUrl = `${baseUrl}/mercadopagoWebhook`;
  const arenaName = (booking.arenaName as string) || (arena.name as string) || "Arena";
  const courtName = (booking.courtName as string) || "Quadra";
  const dateStr = (booking.date as string) || "";
  const title = `Reserva ${arenaName} — ${courtName}${dateStr ? ` (${dateStr})` : ""}`;

  const webAppHost = `${projectIdForUrl}.web.app`;
  const backSuccess = `https://${webAppHost}/arena/${arenaId}/book/success?paid=success&bookingId=${encodeURIComponent(bookingId)}`;
  const backPending = `https://${webAppHost}/arena/${arenaId}/book/success?paid=pending&bookingId=${encodeURIComponent(bookingId)}`;
  const backFailure = `https://${webAppHost}/arena/${arenaId}/book/success?paid=failure&bookingId=${encodeURIComponent(bookingId)}`;

  const preferenceBody = {
    items: [{
      title,
      quantity: 1,
      unit_price: amount,
      currency_id: "BRL",
    }],
    external_reference: `${ARENA_BOOKING_MP_REF_PREFIX}${bookingId}`,
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
    logger.error("createArenaBookingMercadoPagoPayment MP preference failed:", prefRes.status, errText);
    throw new HttpsError("internal", "Não foi possível gerar o link de pagamento. Tente novamente.");
  }

  const prefData = await prefRes.json() as { id?: string; init_point?: string };
  const mpPreferenceId = prefData.id;
  const initPoint = prefData.init_point;
  if (!mpPreferenceId || !initPoint) {
    throw new HttpsError("internal", "Resposta inválida do Mercado Pago");
  }

  await bookingRef.update({
    paymentId: mpPreferenceId,
    paymentStatus: "pending",
    paymentAmountReais: amount,
    mercadopagoPreferenceCreatedAt: FieldValue.serverTimestamp(),
  });

  return {
    init_point: initPoint,
    preferenceId: mpPreferenceId,
  };
});

/**
 * Webhook Mercado Pago (URL única para preferências e inscrições).
 *
 * - `external_reference` `arenaBooking:{id}`: trata aprovado (booking `confirmed`, slot `booked`) e
 *   rejeitado/cancelado/estorno (libera locks e remove slots); pendente/in_process não marca idempotência.
 * - Demais referências (inscrição em torneio): apenas pagamento `approved` atualiza `paidAmount` / `isPaid`.
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
  const payment = await payRes.json() as {
    status?: string;
    external_reference?: string;
    transaction_amount?: number;
  };

  const externalRef = (payment.external_reference || "").trim();
  if (externalRef.startsWith(ARENA_BOOKING_MP_REF_PREFIX)) {
    await processArenaBookingMercadoPagoNotification(db, paymentId, payment, processedRef);
    res.status(200).send("OK");
    return;
  }

  if (payment.status !== "approved") {
    res.status(200).send("OK");
    return;
  }

  const paymentAmount = Number(payment.transaction_amount) || 0;

  const registrationId = externalRef;
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
