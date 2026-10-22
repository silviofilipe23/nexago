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
 * Conta de recebimento (cobrança online Pix/cartão pelo Asaas, com split para o centro):
 *   --wallet-id <walletId Asaas do centro> [--asaas-env production|sandbox] [--fee 5]
 *     grava `trainingCenterReceiving/{id}` (só servidor) e liga `receivingConnected`.
 *     `--asaas-env` tem de casar com o ASAAS_ENV das functions (o DEV usa production).
 *   --disconnect-receiving  desliga `receivingConnected` (as cobranças online param de nascer).
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
const walletId = argValue("--wallet-id");
const asaasEnv = argValue("--asaas-env") || "production";
const fee = argValue("--fee");
const disconnect = process.argv.includes("--disconnect-receiving");

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
  if (process.argv.includes("--receiving") || walletId) {
    patch.receivingConnected = true;
  }
  if (disconnect) {
    patch.receivingConnected = false;
  }
  if (walletId && !["production", "sandbox"].includes(asaasEnv)) {
    console.error("--asaas-env deve ser production ou sandbox.");
    process.exit(1);
  }
  if (fee !== undefined && !(Number(fee) >= 0 && Number(fee) <= 100)) {
    console.error("--fee é um percentual entre 0 e 100.");
    process.exit(1);
  }
  const receiving = walletId ? {
    walletId: walletId.trim(),
    asaasEnv,
    ...(fee !== undefined ? {feePercent: Number(fee)} : {}),
    updatedAt: now,
  } : null;
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
  const show = (o) => JSON.stringify(o, (k, v) => (v && v.constructor && v.constructor.name === "ServerTimestampTransform" ? "<serverTimestamp>" : v), 2);
  console.log(show(patch));
  if (receiving) {
    console.log(`trainingCenterReceiving/${centerId}:`, show(receiving));
  }
  if (!APPLY) {
    console.log("\nDRY-RUN. Rode de novo com --yes para gravar.");
    return;
  }
  const audit = ref.collection("auditLogs").doc();
  const batch = db.batch();
  batch.update(ref, patch);
  if (receiving) {
    batch.set(db.collection("trainingCenterReceiving").doc(centerId), receiving, {merge: true});
  }
  batch.set(audit, {
    at: now,
    actorUid: "system",
    actorName: "NexaGO",
    action: `center.${status}`,
    entity: "center",
    entityId: centerId,
    detail: `Situação do centro: ${current.status} → ${status}` +
      (receiving ? " · conta de recebimento conectada" : disconnect ? " · conta de recebimento desligada" : ""),
    reason,
  });
  await batch.commit();
  console.log("Gravado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
