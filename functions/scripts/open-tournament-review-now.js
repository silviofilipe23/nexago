/* eslint-disable */
/**
 * Abre AGORA a janela de avaliação de um torneio e manda o push
 * `tournament_review_request` para os atletas elegíveis — sem esperar o job
 * diário das 10h (`tournamentReviewDailySweep`).
 *
 * Reusa `openTournamentReviewWindow` (functions/src/tournament-review-sweep.ts):
 * cria `tournamentReviewSummaries/{id}`, convites em
 * `users/{uid}/tournamentReviewInvites/{id}` e notifica só quem ainda não
 * tinha convite. Ignora lookback de 3 dias e a graça de 12h pós-`endAt`.
 *
 * Se a janela já estiver aberta (`invitesComplete: true`), nada muda — use
 * `--resend` para reenviar o push aos convites ainda `pending`.
 *
 * Pré-requisitos:
 *   firebase login   # ou GOOGLE_APPLICATION_CREDENTIALS
 *   npm run build    # na pasta functions/ (precisa de lib/)
 *
 * Uso (na pasta functions/):
 *   # 1) inspecionar:
 *   node scripts/open-tournament-review-now.js \
 *     --project volley-track-dev-4596c --tournament <id>
 *
 *   # 2) abrir + notificar:
 *   node scripts/open-tournament-review-now.js \
 *     --project volley-track-dev-4596c --tournament <id> --yes
 *
 *   # 3) reenviar push aos pending (janela já aberta):
 *   node scripts/open-tournament-review-now.js \
 *     --project volley-track-dev-4596c --tournament <id> --resend --yes
 *
 * FCM (app) funciona via Admin SDK. Web Push do portal pode falhar sem os
 * secrets WEB_PUSH_* — o inbox em `users/{uid}/notifications` grava igual.
 */

const admin = require("firebase-admin");
const {
  openTournamentReviewWindow,
} = require("../lib/tournament-review-sweep");
const {
  deliverNotificationToUser,
} = require("../lib/notification-delivery");
const {
  reviewRequestNotification,
} = require("../lib/tournament-review-notifications");
const {
  TOURNAMENT_REVIEW_SUMMARIES_COLLECTION,
  TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION,
  REVIEW_WINDOW_DAYS,
} = require("../lib/tournament-review-constants");
const {loadTournamentReviewsConfig} = require("../lib/tournament-review-config");
const {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
} = require("../lib/firebase-paths");
const {tournamentManagerUids} = require("../lib/tournament-acl");
const {
  isConfirmedInscription,
  reviewEligibleUids,
} = require("../lib/tournament-review-window");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const APPLY = process.argv.includes("--yes");
const RESEND = process.argv.includes("--resend");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const tournamentId = (argValue("--tournament") || argValue("--id") || "").trim();

if (!projectId) fail("Informe o projeto: --project <projectId>.");
if (!tournamentId) fail("Informe o torneio: --tournament <id>.");

// Paths legados `artifacts/{projectId}/...` leem GCLOUD_PROJECT.
process.env.GCLOUD_PROJECT = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;

admin.initializeApp({projectId});
const db = admin.firestore();

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fmt(ms) {
  return new Date(ms).toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"});
}

async function estimateEligible(tournament) {
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const inscriptions = inscriptionsSnap.docs.map((d) => d.data());
  const teamIds = [
    ...new Set(
      inscriptions.filter(isConfirmedInscription).map((i) => str(i.teamId)).filter(Boolean),
    ),
  ];
  const teamsById = new Map();
  if (teamIds.length > 0) {
    const snaps = await db.getAll(
      ...teamIds.map((id) => db.doc(`${artifactsTeamsPath(projectId)}/${id}`)),
    );
    for (const snap of snaps) {
      if (snap.exists) teamsById.set(snap.id, snap.data());
    }
  }
  const managers = await tournamentManagerUids(db, tournamentId, tournament);
  return reviewEligibleUids(inscriptions, teamsById, managers);
}

async function pendingInviteUids() {
  const snap = await db
    .collectionGroup(TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  return snap.docs
    .map((doc) => doc.ref.parent.parent?.id ?? "")
    .filter(Boolean);
}

async function resendPending(tournamentName) {
  const uids = await pendingInviteUids();
  console.log(`Convites pending: ${uids.length}`);
  if (uids.length === 0) {
    console.log("Nada a reenviar.");
    return;
  }
  if (!APPLY) {
    console.log("\nDRY-RUN — rode de novo com --yes para reenviar o push.");
    return;
  }
  let ok = 0;
  let failCount = 0;
  for (const uid of uids) {
    try {
      await deliverNotificationToUser(
        reviewRequestNotification({uid, tournamentId, tournamentName}),
      );
      ok += 1;
    } catch (error) {
      failCount += 1;
      console.warn(`  push falhou uid=${uid}:`, error?.message ?? error);
    }
  }
  console.log(`Reenviado: ${ok} ok, ${failCount} falha(s).`);
}

async function run() {
  const tourSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tourSnap.exists) fail(`Torneio ${tournamentId} não existe em tournaments/.`);

  const tournament = tourSnap.data();
  const name = str(tournament.name) || "(sem nome)";
  const listing = str(tournament.listingStatus) || str(tournament.status) || "?";
  const config = await loadTournamentReviewsConfig(db);
  const summarySnap = await db
    .collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION)
    .doc(tournamentId)
    .get();
  const summary = summarySnap.exists ? summarySnap.data() : null;
  const eligible = await estimateEligible(tournament);
  const nowMs = Date.now();

  console.log(`\nProjeto:   ${projectId}`);
  console.log(`Torneio:   ${tournamentId}`);
  console.log(`Nome:      ${name}`);
  console.log(`Status:    ${listing}`);
  console.log(`Flag:      appConfig/tournamentReviews.enabled = ${config.enabled}`);
  console.log(`Elegíveis: ${eligible.length} atleta(s)`);
  if (summary) {
    console.log(`Resumo:    status=${summary.status} invitesComplete=${summary.invitesComplete}` +
      ` count=${summary.count ?? 0}`);
    if (summary.opensAt?.toMillis) console.log(`  opensAt:  ${fmt(summary.opensAt.toMillis())}`);
    if (summary.closesAt?.toMillis) console.log(`  closesAt: ${fmt(summary.closesAt.toMillis())}`);
  } else {
    console.log(`Resumo:    (ainda não existe — janela abre por ${REVIEW_WINDOW_DAYS} dias)`);
  }

  if (!config.enabled) {
    console.warn(
      "\nAVISO: flag desligada. O job diário não abre janelas novas, mas este script " +
      "força a abertura deste torneio mesmo assim.",
    );
  }

  if (RESEND) {
    if (!summary || summary.invitesComplete !== true) {
      fail("Não dá pra --resend: a janela ainda não foi aberta. Rode sem --resend primeiro.");
    }
    await resendPending(name);
    return;
  }

  if (summary?.invitesComplete === true) {
    console.log(
      "\nJanela já aberta (invitesComplete=true). Nada a criar.\n" +
      "Para reenviar o push aos pending: acrescente --resend --yes.",
    );
    return;
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN — abriria a janela agora e notificaria até ${eligible.length} atleta(s).\n` +
      "Rode de novo com --yes para aplicar.",
    );
    return;
  }

  const opened = await openTournamentReviewWindow(
    db,
    tournamentId,
    tournament,
    nowMs,
    deliverNotificationToUser,
    projectId,
  );
  if (!opened) {
    console.log("Nada feito (janela já estava completa — race com outro processo?).");
    return;
  }
  console.log("Janela aberta e push enviado aos convites novos.");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
