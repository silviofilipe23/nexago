/* eslint-disable */
/**
 * Dados de exemplo para QA das telas Squad › Embaixadores (02) e Candidaturas & convites (04).
 *
 * Complementa o `seed-squad-commissions.js` (que cria os contratos `seed-squad-*` e as comissões):
 * aqui os contratos ganham início, cidade e arena, e nascem candidaturas e convites em todas as
 * colunas do kanban. Tudo tem id `seed-squad-*` e uids fictícios (push cai no vazio).
 *
 *   squadAmbassadors/seed-squad-*        start/end/cidade/arena (merge — não mexe em nível/código)
 *   squadApplications/seed-squad-app-*   Novas, Em análise, Convidados, Contrato enviado e arquivadas
 *   squadInvites/seed-squad-inv-*        os convites dos cards de Convidados/Contrato enviado
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-squad-program.js --project <id>                 # mostra o que gravaria
 *   node scripts/seed-squad-program.js --project <id> --yes
 *   node scripts/seed-squad-program.js --project <id> --clear --yes   # apaga candidaturas/convites do seed
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const CLEAR = process.argv.includes("--clear");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
admin.initializeApp({projectId});
const db = admin.firestore();
const PREFIX = "seed-squad-";
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (days) => new Date(now - days * DAY);

const CONTRACTS = [
  {id: "jv", city: "Goiânia", arenaName: "Arena Errejota", startDaysAgo: 60},
  {id: "mr", city: "Goiânia", arenaName: "Arena CFC", startDaysAgo: 55},
  {id: "rb", city: "Brasília", arenaName: "Arena Lago", startDaysAgo: 50},
  {id: "ac", city: "Goiânia", arenaName: "Arena Errejota", startDaysAgo: 45},
  {id: "pl", city: "Aparecida", arenaName: "Praia BT Sul", startDaysAgo: 40},
  {id: "vs", city: "Goiânia", arenaName: "Arena CFC", startDaysAgo: 35},
  {id: "jp", city: "Anápolis", arenaName: "Beach Club", startDaysAgo: 12},
];

const snapshot = (over) => ({
  city: "Goiânia", state: "GO", arenaName: null, photoUrl: null, tournaments: 6, elo: "Competidor II",
  rankingPoints: 400, rankingPosition: 42, referredCount: 2, conductIncidents: null, memberSince: ago(400), ...over,
});

/** [id, nome, etapa, sugestão, snapshot, respostas, redes, nota, convite?] */
const APPLICATIONS = [
  ["fc", "Felipe Cardoso", "new", "cap", {arenaName: "Arena CFC", tournaments: 18, referredCount: 22}, "10to30", null, "Treina 3 turmas na CFC. Leva grupo de 20+ para torneios."],
  ["lm", "Larissa Moura", "new", "amb", {city: "Brasília", state: "DF", arenaName: "Arena Lago", tournaments: 9}, "no", {followers: 24000, engagementPct: 3.1}, null],
  ["gp", "Gustavo Pires", "new", "ath", {city: "Anápolis", arenaName: "Beach Club", tournaments: 6}, "no", null, null],
  ["ra", "Renata Alves", "review", "amb", {arenaName: "Praia BT Sul", tournaments: 14}, "lt10", {followers: 8000, engagementPct: 5.2}, "Checar histórico de conduta com a arena."],
  ["ct", "Caio Teixeira", "review", "ath", {arenaName: "Arena Errejota", tournaments: 11}, "no", null, null],
  ["bn", "Bia Nogueira", "invited", "pro", {city: "Brasília", state: "DF", arenaName: "Arena Lago", tournaments: 20, rankingPosition: 3}, "no", {followers: 61000, engagementPct: 4.4}, null, {status: "sent", sentDaysAgo: 3}],
  ["tm", "Thiago Moura", "invited", "cap", {arenaName: "Arena CFC", tournaments: 21, referredCount: 45}, "gt30", null, null, {status: "sent", sentDaysAgo: 1}],
  ["sl", "Sofia Lins", "contract", "amb", {city: "Aparecida", arenaName: "Praia BT Sul", tournaments: 12}, "lt10", {followers: 15000, engagementPct: 4.1}, null, {status: "opened", sentDaysAgo: 2, openedDaysAgo: 0}],
  ["wl", "Wesley Lopes", "archived:waitlist", "ath", {tournaments: 4}, "no", null, null],
];

async function main() {
  if (CLEAR) {
    const ids = [
      ...APPLICATIONS.map(([id]) => `squadApplications/${PREFIX}app-${id}`),
      ...APPLICATIONS.filter((a) => a[8]).map(([id]) => `squadInvites/${PREFIX}inv-${id}`),
    ];
    console.log(`Apagaria ${ids.length} docs:`, ids.join(", "));
    if (!APPLY) return console.log("\nDRY-RUN — use --yes.");
    const batch = db.batch();
    for (const path of ids) batch.delete(db.doc(path));
    await batch.commit();
    return console.log("Apagado.");
  }

  const batch = db.batch();
  const cycleEnd = new Date("2026-12-07T02:59:59Z");
  for (const c of CONTRACTS) {
    batch.set(db.collection("squadAmbassadors").doc(PREFIX + c.id), {
      athleteId: PREFIX + c.id, city: c.city, arenaName: c.arenaName, start: ago(c.startDaysAgo), end: cycleEnd,
      slug: null, amendments: [], seed: true,
    }, {merge: true});
  }
  for (const [id, name, stageRaw, tier, snap, leadsGroup, social, note, invite] of APPLICATIONS) {
    const [stage, archivedReason] = stageRaw.split(":");
    const appId = `${PREFIX}app-${id}`;
    const inviteId = invite ? `${PREFIX}inv-${id}` : null;
    batch.set(db.collection("squadApplications").doc(appId), {
      athleteId: `${PREFIX}athlete-${id}`,
      athleteName: name,
      submittedAt: ago(5),
      source: "app",
      answers: {instagram: name.split(" ")[0].toLowerCase(), city: snap.city ?? "Goiânia", leadsGroup, why: "Quero levar mais gente para os torneios."},
      social: social ? {...social, checkedAt: ago(1), checkedBy: {uid: "seed", name: "Seed de QA"}} : null,
      snapshot: snapshot({name, ...snap}),
      suggestedTier: tier,
      suggestedBy: "auto",
      stage,
      archivedReason: archivedReason ?? null,
      internalReason: null,
      notes: note ? [{by: {uid: "seed", name: "Lia Martins"}, at: ago(1), text: note}] : [],
      inviteId,
      createdAt: ago(5),
      updatedAt: ago(1),
      stageChangedAt: ago(1),
      seed: true,
    });
    if (invite) {
      batch.set(db.collection("squadInvites").doc(inviteId), {
        athleteId: `${PREFIX}athlete-${id}`,
        athleteName: name,
        applicationId: appId,
        tier,
        commissionPct: tier === "pro" ? 12 : null,
        suggestedCode: `${name.split(" ")[0].toUpperCase()}10`,
        periodStart: null,
        periodEnd: "2026-12-06",
        message: null,
        scheduledFor: null,
        sentAt: ago(invite.sentDaysAgo),
        openedAt: invite.openedDaysAgo != null ? ago(invite.openedDaysAgo) : null,
        acceptedAt: null,
        expiresAt: new Date(now + 7 * DAY - (invite.openedDaysAgo ?? invite.sentDaysAgo) * DAY),
        status: invite.status,
        reminders: [],
        cycleId: "piloto",
        createdAt: ago(invite.sentDaysAgo),
        createdBy: {uid: "seed", name: "Seed de QA"},
        updatedAt: ago(0),
        seed: true,
      });
    }
  }
  console.log(`Gravaria ${CONTRACTS.length} complementos de contrato, ${APPLICATIONS.length} candidaturas e ${APPLICATIONS.filter((a) => a[8]).length} convites em ${projectId}.`);
  if (!APPLY) return console.log("\nDRY-RUN — use --yes para gravar.");
  await batch.commit();
  console.log("Gravado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
