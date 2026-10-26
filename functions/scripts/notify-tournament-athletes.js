/* eslint-disable */
/**
 * Manda um push para os atletas inscritos num torneio, abrindo o detalhe do
 * torneio no toque (`url: /torneios/{id}`, rota do app — ver
 * `resolveNotificationRoute`; tipo novo funciona no app publicado porque o
 * app prefere `data.url` que começa com "/").
 *
 * Espelha `deliverNotificationToUser` (functions/src/notification-delivery.ts):
 * FCM para cada `users/{uid}/tokens` + item no inbox `users/{uid}/notifications`
 * (o inbox é o único canal que alcança quem está sem token). Web Push fica de
 * fora — depende dos secrets VAPID da function.
 *
 * Destinatários: elenco de cada inscrição (mesma regra de
 * `registrationAthleteUids`: com equipe, memberUids + player1/2; sem equipe,
 * player1Id + participantUids). Por padrão só inscrição confirmada
 * (`isPaid && !waitlist`), igual ao público "pagos" da aba Comunicação.
 *
 * Uso (na pasta functions/):
 *   node scripts/notify-tournament-athletes.js --project volley-track-dev-4596c \
 *     --tournament <id> --title "..." --body "..."            # dry-run
 *   ... --uid <userId> --yes                                   # envio de teste
 *   ... --yes                                                  # disparo
 *
 * Flags opcionais:
 *   --audience <paid|pending|all>   default: paid
 *   --type <texto>                  data.type (default: tournament_reminder)
 *   --resend                        não pula quem já tem esse type+torneio no inbox
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const RESEND = process.argv.includes("--resend");
const projectId = argValue("--project");
const TOURNAMENT_ID = argValue("--tournament");
const TITLE = argValue("--title");
const BODY = argValue("--body");
const SINGLE_UID = argValue("--uid");
const AUDIENCE = (argValue("--audience") || "paid").toLowerCase();
const TYPE = argValue("--type") || "tournament_reminder";

if (!projectId || !TOURNAMENT_ID || !TITLE || !BODY) {
  console.error("Obrigatórios: --project, --tournament, --title, --body.");
  process.exit(1);
}
if (!["paid", "pending", "all"].includes(AUDIENCE)) {
  console.error("--audience aceita paid, pending ou all.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const messaging = admin.messaging();
const base = `artifacts/${projectId}/public/data`;
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/registration-token-not-found",
]);

function strings(list) {
  return list.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
}

function registrationAthleteUids(registration, team) {
  if (team) {
    const members = Array.isArray(team.memberUids) ? team.memberUids : [];
    return [...new Set(strings([...members, team.player1Id, team.player2Id]))];
  }
  const parts = Array.isArray(registration.participantUids) ? registration.participantUids : [];
  return [...new Set(strings([registration.player1Id, ...parts]))];
}

async function collectRecipients() {
  const snap = await db
    .collection(`${base}/inscriptions`)
    .where("tournamentId", "==", TOURNAMENT_ID)
    .get();
  const uids = new Set();
  let inscriptions = 0;
  for (const doc of snap.docs) {
    const r = doc.data();
    const confirmed = r.isPaid === true && r.waitlist !== true;
    if (AUDIENCE === "paid" && !confirmed) continue;
    if (AUDIENCE === "pending" && confirmed) continue;
    const teamId = typeof r.teamId === "string" ? r.teamId.trim() : "";
    let team = null;
    if (teamId) {
      const teamSnap = await db.doc(`${base}/teams/${teamId}`).get();
      if (!teamSnap.exists) continue;
      team = teamSnap.data();
    }
    const ids = registrationAthleteUids(r, team);
    if (ids.length === 0) continue;
    inscriptions += 1;
    ids.forEach((id) => uids.add(id));
  }
  return {uids: [...uids], inscriptions, total: snap.size};
}

async function alreadyNotified(uid) {
  const snap = await db
    .collection(`users/${uid}/notifications`)
    .where("type", "==", TYPE)
    .where("data.tournamentId", "==", TOURNAMENT_ID)
    .limit(1)
    .get();
  return !snap.empty;
}

async function sendTo(uid, data) {
  const tokensSnap = await db.collection(`users/${uid}/tokens`).get();
  const byToken = new Map();
  for (const d of tokensSnap.docs) {
    const t = d.data().token;
    if (typeof t === "string" && t.trim()) byToken.set(t.trim(), d);
  }
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
  return {tokens: byToken.size, sent, failed};
}

(async () => {
  const tSnap = await db.doc(`tournaments/${TOURNAMENT_ID}`).get();
  if (!tSnap.exists) throw new Error(`Torneio ${TOURNAMENT_ID} não existe em ${projectId}.`);
  const tName = tSnap.data().name || TOURNAMENT_ID;
  const data = {tournamentId: TOURNAMENT_ID, url: `/torneios/${TOURNAMENT_ID}`};

  let uids;
  if (SINGLE_UID) {
    uids = [SINGLE_UID];
    console.log(`Envio de teste para ${SINGLE_UID}`);
  } else {
    const r = await collectRecipients();
    uids = r.uids;
    console.log(`${tName}: ${r.total} inscrições, ${r.inscriptions} no público "${AUDIENCE}", ${uids.length} atletas.`);
  }

  let withToken = 0;
  let skipped = 0;
  const pending = [];
  for (const uid of uids) {
    if (!SINGLE_UID && !RESEND && (await alreadyNotified(uid))) {
      skipped += 1;
      continue;
    }
    const tokens = await db.collection(`users/${uid}/tokens`).limit(1).get();
    if (!tokens.empty) withToken += 1;
    pending.push(uid);
  }
  console.log(`A enviar: ${pending.length} (com token FCM: ${withToken}; já avisados e pulados: ${skipped}).`);
  console.log(`Mensagem: "${TITLE}" — "${BODY}" | type=${TYPE} url=${data.url}`);

  if (!APPLY) {
    console.log("DRY-RUN. Repita com --yes para enviar.");
    return;
  }
  const totals = {sent: 0, failed: 0, inbox: 0};
  for (const uid of pending) {
    const r = await sendTo(uid, data);
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.inbox += 1;
  }
  console.log(`Feito: ${totals.sent} push entregues ao FCM, ${totals.failed} falhas, ${totals.inbox} itens no inbox.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
