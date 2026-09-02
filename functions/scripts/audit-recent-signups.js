/* eslint-disable */
/**
 * Funil de cadastro do atleta: contas recém-criadas no Firebase Auth e em que
 * ponto cada uma parou — `users/{uid}` existe? o app considera o onboarding
 * concluído? a foto de perfil (que sobe ANTES do save do perfil) chegou ao
 * Storage? Só leitura; e-mails saem mascarados.
 *
 * Serve pra confirmar em campo se "conta criada mas atleta preso no formulário"
 * ainda acontece depois de uma release: conta sem `users/{uid}` E sem avatar
 * nunca passou do formulário de criar conta (ou desistiu antes da foto).
 *
 * Uso (na pasta functions/):
 *   node scripts/audit-recent-signups.js --project volley-track-dev-4596c
 *   node scripts/audit-recent-signups.js --project <id> --days 30
 *   node scripts/audit-recent-signups.js --project <id> --only-incomplete
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
const days = Number(argValue("--days") || 10);
const onlyIncomplete = process.argv.includes("--only-incomplete");

admin.initializeApp({projectId, storageBucket: `${projectId}.firebasestorage.app`});
const auth = admin.auth();
const db = admin.firestore();
const bucket = admin.storage().bucket();

function mask(email) {
  if (!email) return "(sem e-mail)";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

function fmt(t) {
  return t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "-";
}

/** Mesma derivação de `AthleteProfile.fromFirestore` (app) para onboardingCompleted. */
function appConsidersComplete(data) {
  if (!data) return false;
  return (
    data.isProfileComplete === true ||
    data.onboardingCompleted === true ||
    (data.sportOnboarding && data.sportOnboarding.completedAt != null)
  );
}

async function listRecentUsers() {
  const since = Date.now() - days * 86400e3;
  const recent = [];
  let pageToken;
  let total = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.length;
    for (const u of page.users) {
      if (Date.parse(u.metadata.creationTime) >= since) recent.push(u);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  recent.sort((a, b) => Date.parse(a.metadata.creationTime) - Date.parse(b.metadata.creationTime));
  return {recent, total};
}

(async () => {
  const {recent, total} = await listRecentUsers();
  console.log(`projeto=${projectId} usuários=${total} criados nos últimos ${days} dias=${recent.length}\n`);

  const rows = [];
  for (const u of recent) {
    const [userSnap, files] = await Promise.all([
      db.doc(`users/${u.uid}`).get(),
      bucket.getFiles({prefix: `profiles/${u.uid}/`}),
    ]);
    const data = userSnap.exists ? userSnap.data() : null;
    const complete = appConsidersComplete(data);
    rows.push({
      uid: u.uid.slice(0, 8),
      email: mask(u.email),
      provedor: u.providerData.map((p) => p.providerId.replace(".com", "")).join("+") || "-",
      criado: fmt(u.metadata.creationTime),
      ultimoRefresh: fmt(u.metadata.lastRefreshTime),
      claimAtleta: u.customClaims && Array.isArray(u.customClaims.roles) && u.customClaims.roles.includes("athlete") ? "S" : "N",
      usersDoc: data ? "S" : "N",
      onboardingOk: complete ? "S" : "N",
      avatarStorage: files[0].length > 0 ? "S" : "N",
    });
  }

  const incomplete = rows.filter((r) => r.onboardingOk === "N");
  console.table(onlyIncomplete ? incomplete : rows);

  const semDoc = incomplete.filter((r) => r.usersDoc === "N").length;
  const comDocSemOnboarding = incomplete.length - semDoc;
  const semAvatar = incomplete.filter((r) => r.avatarStorage === "N").length;
  console.log(
    `\nconcluídos: ${rows.length - incomplete.length} | incompletos: ${incomplete.length}` +
      ` (sem users/{uid}: ${semDoc}; com doc mas sem onboarding: ${comDocSemOnboarding}; sem avatar no Storage: ${semAvatar})`,
  );
})().catch((err) => {
  console.error("Falha:", err.message || err);
  process.exit(1);
});
