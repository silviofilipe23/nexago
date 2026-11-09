/* eslint-disable */
/**
 * Manda um push de campanha para todos os atletas com o app instalado
 * (ex.: aviso de versão nova). Abre `--url` no toque, que precisa ser rota do
 * APP começando com "/" (ver `resolveNotificationRoute`).
 *
 * Quem recebe: mesma régua do push do blog (functions/src/blog-push.ts), sem
 * o filtro de cidade/esporte. Atleta (`roles` com "athlete" ou `role` legado),
 * fora seed/QA, que não desligou o push nas Configurações
 * (`notificationPreferences.channels.push`) e tem ao menos um token em
 * `users/{uid}/tokens`. Sem token não há instalação para alcançar.
 *
 * Espelha `deliverNotificationToUser` (functions/src/notification-delivery.ts):
 * FCM para cada token + item no inbox `users/{uid}/notifications`. Web Push
 * fica de fora, porque depende dos secrets VAPID da function. O inbox também é
 * a trava contra reenvio: quem já tem `type` + `data.campaign` é pulado.
 *
 * Uso (na pasta functions/):
 *   node scripts/notify-all-athletes.js --project volley-track-dev-4596c \
 *     --campaign <id> --title "..." --body "..." --url /athlete/blog   # dry-run
 *   ... --uid <userId> --yes                                          # envio de teste
 *   ... --yes                                                         # disparo
 *
 * Flags opcionais:
 *   --type <texto>   data.type (default: campaign)
 *   --resend         não pula quem já recebeu esta campanha
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const RESEND = process.argv.includes("--resend");
const projectId = argValue("--project");
const CAMPAIGN = argValue("--campaign");
const TITLE = argValue("--title");
const BODY = argValue("--body");
const URL = argValue("--url");
const SINGLE_UID = argValue("--uid");
const TYPE = argValue("--type") || "campaign";

if (!projectId || !CAMPAIGN || !TITLE || !BODY || !URL) {
  console.error("Obrigatórios: --project, --campaign, --title, --body, --url.");
  process.exit(1);
}
if (!URL.startsWith("/")) {
  console.error("--url precisa ser rota do app começando com \"/\" (ex.: /athlete/blog).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const messaging = admin.messaging();
const GET_ALL_CHUNK = 100;
const TEST_EMAIL_SUFFIXES = ["@nexago.test", "@nexago.dev", "@example.com"];
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/registration-token-not-found",
]);

function isAthlete(d) {
  if (Array.isArray(d.roles)) return d.roles.includes("athlete");
  return d.role === "athlete";
}

function isTestAccount(d) {
  if (d.seedTestAthlete === true) return true;
  const email = typeof d.email === "string" ? d.email.toLowerCase() : "";
  return TEST_EMAIL_SUFFIXES.some((s) => email.endsWith(s));
}

function pushChannelOn(d) {
  return d.notificationPreferences?.channels?.push !== false;
}

/** Tokens válidos por uid, lidos de uma vez pelo collection group. */
async function tokensByUid() {
  const snap = await db.collectionGroup("tokens").get();
  const map = new Map();
  for (const doc of snap.docs) {
    const parts = doc.ref.path.split("/");
    if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== "tokens") continue;
    const token = doc.get("token");
    if (typeof token !== "string" || !token.trim()) continue;
    const list = map.get(parts[1]) || [];
    list.push(doc);
    map.set(parts[1], list);
  }
  return map;
}

async function collectRecipients(tokens) {
  const uids = [...tokens.keys()];
  const counts = {withApp: uids.length, notAthlete: 0, test: 0, pushOff: 0};
  const recipients = [];
  for (let i = 0; i < uids.length; i += GET_ALL_CHUNK) {
    const refs = uids.slice(i, i + GET_ALL_CHUNK).map((uid) => db.doc(`users/${uid}`));
    for (const snap of await db.getAll(...refs)) {
      const d = snap.data();
      if (!d || !isAthlete(d)) counts.notAthlete += 1;
      else if (isTestAccount(d)) counts.test += 1;
      else if (!pushChannelOn(d)) counts.pushOff += 1;
      else recipients.push(snap.id);
    }
  }
  return {recipients, counts};
}

async function alreadyNotified(uid) {
  const snap = await db
    .collection(`users/${uid}/notifications`)
    .where("type", "==", TYPE)
    .where("data.campaign", "==", CAMPAIGN)
    .limit(1)
    .get();
  return !snap.empty;
}

async function sendTo(uid, tokenDocs, data) {
  const byToken = new Map();
  for (const doc of tokenDocs) byToken.set(doc.get("token").trim(), doc);
  let sent = 0;
  let failed = 0;
  for (const [token, doc] of byToken) {
    try {
      await messaging.send({
        token,
        notification: {title: TITLE, body: BODY},
        data: {...data, type: TYPE, requireInteraction: "true"},
        android: {priority: "high", notification: {channelId: "default", sound: "default"}},
        apns: {
          headers: {"apns-priority": "10", "apns-push-type": "alert"},
          payload: {aps: {alert: {title: TITLE, body: BODY}, sound: "default"}},
        },
        fcmOptions: {analyticsLabel: TYPE},
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      if (INVALID_TOKEN_CODES.has(err?.code)) await doc.ref.delete().catch(() => {});
    }
  }
  await db.collection(`users/${uid}/notifications`).add({
    userId: uid,
    title: TITLE,
    body: BODY,
    type: TYPE,
    data,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    readAt: null,
  });
  return {sent, failed};
}

(async () => {
  const data = {url: URL, campaign: CAMPAIGN};
  const tokens = await tokensByUid();

  let uids;
  if (SINGLE_UID) {
    uids = [SINGLE_UID];
    console.log(`Envio de teste para ${SINGLE_UID} (${(tokens.get(SINGLE_UID) || []).length} tokens).`);
  } else {
    const {recipients, counts} = await collectRecipients(tokens);
    uids = recipients;
    console.log(
      `Usuários com app: ${counts.withApp} | não atleta: ${counts.notAthlete} | seed/QA: ${counts.test} | ` +
        `push desligado: ${counts.pushOff} | atletas no público: ${uids.length}`
    );
  }

  let skipped = 0;
  let tokenCount = 0;
  const builds = new Map();
  const pending = [];
  for (const uid of uids) {
    if (!SINGLE_UID && !RESEND && (await alreadyNotified(uid))) {
      skipped += 1;
      continue;
    }
    for (const doc of tokens.get(uid) || []) {
      tokenCount += 1;
      const key = `${doc.get("platform") || "?"} ${doc.get("buildNumber") ?? "sem build"}`;
      builds.set(key, (builds.get(key) || 0) + 1);
    }
    pending.push(uid);
  }
  console.log(`A enviar: ${pending.length} atletas, ${tokenCount} aparelhos (já avisados e pulados: ${skipped}).`);
  console.log(`Aparelhos por plataforma/build: ${[...builds].sort().map(([k, n]) => `${k}=${n}`).join(", ")}`);
  console.log(`Mensagem: "${TITLE}" | "${BODY}" | type=${TYPE} campaign=${CAMPAIGN} url=${URL}`);

  if (!APPLY) {
    console.log("DRY-RUN. Repita com --yes para enviar.");
    return;
  }
  const totals = {sent: 0, failed: 0, inbox: 0};
  for (const uid of pending) {
    const r = await sendTo(uid, tokens.get(uid) || [], data);
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.inbox += 1;
  }
  console.log(`Feito: ${totals.sent} push entregues ao FCM, ${totals.failed} falhas, ${totals.inbox} itens no inbox.`);
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
