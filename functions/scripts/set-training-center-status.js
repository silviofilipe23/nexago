/* eslint-disable */
/**
 * Muda a situação de um Centro de Treinamento (`trainingCenters/{id}`) — o que o owner NÃO
 * consegue pelo portal (as rules travam `status`, `receivingConnected` e `subscription`).
 * Substitui o backoffice enquanto a tela de centros não existe lá.
 *
 *   pending   → cadastro feito, aguardando recebimento + assinatura
 *   active    → libera matrículas e cobranças
 *   suspended → somente leitura (assinatura NexaGO vencida); histórico preservado
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/set-training-center-status.js --project volley-track-dev-4596c --list
 *   node scripts/set-training-center-status.js --project volley-track-dev-4596c --center <id> --status active --receiving --plan "NexaGO Centro Pro"
 *   node scripts/set-training-center-status.js --project volley-track-dev-4596c --center <id> --status suspended --reason "Assinatura vencida em 10 out" --open-invoice 24900 --due 2026-10-10
 *
 * Sem --yes é DRY-RUN.
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
const centerId = argValue("--center");
const status = argValue("--status");
const reason = argValue("--reason") || "";
const plan = argValue("--plan");
const openInvoice = argValue("--open-invoice");
const due = argValue("--due");

if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

async function list() {
  const snap = await db.collection("trainingCenters").get();
  if (snap.empty) {
    console.log("Nenhum centro cadastrado.");
    return;
  }
  for (const d of snap.docs) {
    const c = d.data();
    console.log(`${d.id}  ${String(c.status).padEnd(9)}  ${c.name}  (owner ${c.ownerName || c.ownerUid})${c.activationRequestedAt ? "  · ativação solicitada" : ""}`);
  }
}

async function main() {
  if (process.argv.includes("--list")) {
    return list();
  }
  if (!centerId || !["pending", "active", "suspended"].includes(status)) {
    console.error("Use --center <id> --status pending|active|suspended (ou --list).");
    process.exit(1);
  }
  const ref = db.collection("trainingCenters").doc(centerId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Centro ${centerId} não existe em ${projectId}.`);
    process.exit(1);
  }
  const current = snap.data();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const patch = {status};
  if (status === "active") {
    patch.activatedAt = current.activatedAt || now;
    patch.suspendedAt = null;
    patch.suspendedReason = "";
  }
  if (status === "suspended") {
    patch.suspendedAt = now;
    patch.suspendedReason = reason;
  }
  if (process.argv.includes("--receiving")) {
    patch.receivingConnected = true;
  }
  if (plan || openInvoice || due) {
    patch.subscription = {
      ...(current.subscription || {}),
      plan: plan || (current.subscription && current.subscription.plan) || "NexaGO Centro",
      status: status === "suspended" ? "past_due" : status === "active" ? "active" : "trial",
      openInvoiceCents: openInvoice ? Number(openInvoice) : null,
      dueDate: due || null,
      attempts: (current.subscription && current.subscription.attempts) || null,
    };
  }
  console.log(`\n${current.name} (${centerId}) · ${current.status} → ${status}`);
  console.log(JSON.stringify(patch, (k, v) => (v && v.constructor && v.constructor.name === "ServerTimestampTransform" ? "<serverTimestamp>" : v), 2));
  if (!APPLY) {
    console.log("\nDRY-RUN. Rode de novo com --yes para gravar.");
    return;
  }
  const audit = ref.collection("auditLogs").doc();
  const batch = db.batch();
  batch.update(ref, patch);
  batch.set(audit, {
    at: now,
    actorUid: "system",
    actorName: "NexaGO",
    action: `center.${status}`,
    entity: "center",
    entityId: centerId,
    detail: `Situação do centro: ${current.status} → ${status}`,
    reason,
  });
  await batch.commit();
  console.log("Gravado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
