/* eslint-disable */
/**
 * Manda uma notificação push para todo usuário com o app instalado
 * (qualquer role — não filtra por atleta/organizador/arena).
 *
 * Alvo: varre `users/{uid}/tokens`, que é onde o app grava
 * `{token, platform, updatedAt}` por instalação. Quem nunca abriu o app
 * (sem token salvo) não recebe nada — não tem outro jeito de alcançar.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/send-broadcast-notification.js --project <projectId> --title "..." --body "..."
 *   node scripts/send-broadcast-notification.js --project <projectId> --title "..." --body "..." --uid <userId> --yes
 *   node scripts/send-broadcast-notification.js --project <projectId> --title "..." --body "..." --yes
 *
 * Sem --yes é DRY-RUN: conta os destinatários e imprime a mensagem, sem enviar.
 * SEMPRE rode o dry-run e depois um envio de teste com --uid antes do disparo geral.
 *
 * Flags obrigatórias:
 *   --title <texto>
 *   --body <texto>
 *
 * Flags opcionais:
 *   --platform <android|ios|all>  default: all
 *   --url <path ou link>          rota interna (ex.: /torneios) ou link externo aberto no tap
 *   --type <texto>                data.type do payload (default: broadcast)
 *   --limit <n>                   para no N-ésimo usuário varrido (teste)
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const PLATFORM = (argValue("--platform") || "all").toLowerCase();
const SINGLE_UID = argValue("--uid");
const LIMIT = parseInt(argValue("--limit") || "0", 10);

const TITLE = argValue("--title");
const BODY = argValue("--body");
const URL = argValue("--url");
const TYPE = argValue("--type") || "broadcast";

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}
if (!TITLE || !BODY) {
  console.error("Informe --title e --body (a mensagem é obrigatória, sem default).");
  process.exit(1);
}
if (!["android", "ios", "all"].includes(PLATFORM)) {
  console.error("--platform aceita android, ios ou all.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const messaging = admin.messaging();

async function* iterateUserIds() {
  if (SINGLE_UID) {
    yield SINGLE_UID;
    return;
  }
  let lastId = null;
  while (true) {
    let query = db
      .collection("users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) return;
    for (const doc of snap.docs) yield doc.id;
    lastId = snap.docs[snap.docs.length - 1].id;
  }
}

function matchesPlatform(tokenPlatform) {
  if (PLATFORM === "all") return true;
  return (tokenPlatform || "").toLowerCase() === PLATFORM;
}

/** Tokens FCM da plataforma alvo. Espelha parseStoredFcmTokens (sem fallback para doc.id). */
async function tokensForUser(userId) {
  const snap = await db.collection(`users/${userId}/tokens`).get();
  return snap.docs
    .map((doc) => ({docId: doc.id, ...doc.data()}))
    .filter((t) => typeof t.token === "string" && t.token.trim().length > 0)
    .filter((t) => matchesPlatform(t.platform))
    .map((t) => ({docId: t.docId, token: t.token.trim()}));
}

function isInvalidTokenError(code) {
  return (
    code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/registration-token-not-found"
  );
}

async function sendToTokens(userId, tokens) {
  const data = {type: TYPE};
  if (URL) data.url = URL;

  const message = {
    notification: {title: TITLE, body: BODY},
    data,
    android: {priority: "high", notification: {sound: "default"}},
    apns: {
      headers: {"apns-priority": "10", "apns-push-type": "alert"},
      payload: {aps: {alert: {title: TITLE, body: BODY}, sound: "default"}},
    },
    fcmOptions: {analyticsLabel: TYPE},
  };

  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    ...message,
  });

  // Limpa tokens mortos no caminho — reduz ruído nos próximos disparos.
  const stale = [];
  response.responses.forEach((res, i) => {
    if (!res.success && isInvalidTokenError(res.error?.code || "")) {
      stale.push(tokens[i].docId);
    }
  });
  await Promise.all(
    stale.map((docId) =>
      db.doc(`users/${userId}/tokens/${docId}`).delete().catch(() => {})
    )
  );

  return {sent: response.successCount, failed: response.failureCount, stale: stale.length};
}

async function run() {
  console.log(`Projeto: ${projectId}`);
  console.log(`Plataforma alvo: ${PLATFORM}`);
  console.log(`\nMensagem:\n  ${TITLE}\n  ${BODY}\n  type -> ${TYPE}${URL ? `\n  tap -> ${URL}` : ""}\n`);

  let scanned = 0;
  let recipients = 0;
  let tokenCount = 0;
  let sent = 0;
  let failed = 0;
  let stale = 0;

  for await (const userId of iterateUserIds()) {
    scanned++;
    if (LIMIT > 0 && scanned > LIMIT) break;

    const tokens = await tokensForUser(userId);
    if (tokens.length === 0) continue;

    recipients++;
    tokenCount += tokens.length;

    if (APPLY) {
      const result = await sendToTokens(userId, tokens);
      sent += result.sent;
      failed += result.failed;
      stale += result.stale;
    }

    if (recipients % 100 === 0) {
      console.log(`  ... ${recipients} destinatários (${scanned} varridos)`);
    }
  }

  console.log(`\nUsuários varridos: ${scanned}`);
  console.log(`Destinatários com token ${PLATFORM}: ${recipients} (${tokenCount} tokens)`);

  if (!APPLY) {
    console.log("\nDRY-RUN. Nenhum push enviado.");
    console.log("Teste em você antes: --uid <seuUserId> --yes");
    console.log("Disparo geral: --yes");
    return;
  }

  console.log(`Push enviados: ${sent} | falhas: ${failed} | tokens mortos removidos: ${stale}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
