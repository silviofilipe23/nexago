/* eslint-disable */
/**
 * Dá baixa em saque "aprovado e não pago" que, na verdade, foi pago por fora.
 *
 * O caso: o `status` do saque foi trocado para `approved` à mão (console do Firebase), sem passar
 * pela revisão do backoffice. O PIX saiu por fora, mas a reserva continuou em `pendingReais` do
 * caixa — e o callable de revisão recusa o saque, porque ele já não está `pending`. O backoffice
 * (Financeiro › Visão geral) mostra esses saques como "Saque aprovado e não pago".
 *
 * O script faz o que o "Pago por fora" do backoffice faria, numa transação só:
 *   - saque: `payoutStatus: "manual"`, `reviewedAt`, `reviewedBy`, `reviewNote`, `updatedAt`;
 *   - caixa de onde saiu (torneio, carteira antiga do organizador ou arena): `pendingReais −= valor`.
 *
 * Só mexe em saque `approved` com `payoutStatus` `pending` ou `failed` — rodar de novo não faz nada.
 * Recusa se o caixa não tiver o valor reservado (alguém já baixou por outro caminho).
 *
 * Use SÓ depois de confirmar com o dono que o PIX saiu (extrato do Asaas ou do banco). Se não saiu,
 * o certo é voltar o saque para `pending` e pagar pela fila de saques.
 *
 * Uso (na pasta functions/):
 *   node scripts/close-stuck-withdrawal-paid-outside.js --project volley-track-dev-4596c --kind organizer --id <saqueId>
 *   node scripts/close-stuck-withdrawal-paid-outside.js ... --yes
 * Opcional: --note "texto" (padrão abaixo).
 */
const admin = require("firebase-admin");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const PROJECT = arg("project");
const KIND = arg("kind", "organizer");
const ID = arg("id");
const APPLY = process.argv.includes("--yes");
const NOTE = arg(
  "note",
  "PIX enviado manualmente fora do sistema. Baixa por script: o status tinha sido trocado à mão sem consumir a reserva do caixa.",
);
if (!PROJECT || !ID || !["organizer", "arena"].includes(KIND)) {
  console.error("Uso: --project <id> --kind organizer|arena --id <saqueId> [--note <texto>] [--yes]");
  process.exit(1);
}

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const {FieldValue} = admin.firestore;
const BRL = (v) => `R$ ${Number(v || 0).toFixed(2)}`;
const round = (v) => Math.round(v * 100) / 100;

/** Mesma resolução do backend (`resolveWithdrawalWalletTarget` / `withdrawalWalletRef`). */
function walletRefOf(w) {
  if (KIND === "arena") {
    const arenaId = String(w.arenaId || "").trim();
    if (!arenaId) throw new Error("saque sem arenaId");
    return db.collection("arenaWallets").doc(arenaId);
  }
  const tournamentId = String(w.tournamentId || "").trim();
  if (tournamentId) return db.collection("tournamentWallets").doc(tournamentId);
  const organizerId = String(w.organizerId || "").trim();
  if (!organizerId) throw new Error("saque sem tournamentId nem organizerId");
  return db.collection("organizerWallets").doc(organizerId);
}

async function main() {
  const col = KIND === "arena" ? "arenaWithdrawals" : "organizerWithdrawals";
  const ref = db.collection(col).doc(ID);
  console.log(`\nProjeto: ${PROJECT}  |  ${col}/${ID}  |  modo: ${APPLY ? "APLICAR" : "DRY-RUN"}\n`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("saque não existe");
    const w = snap.data();
    const amount = round(Number(w.amountReais) || 0);
    const walletRef = walletRefOf(w);
    const wallet = (await tx.get(walletRef)).data() || {};
    const pending = round(Number(wallet.pendingReais) || 0);

    console.log(`saque: status=${w.status} payoutStatus=${w.payoutStatus} valor=${BRL(amount)} reviewedAt=${w.reviewedAt ? "sim" : "não"}`);
    console.log(`caixa: ${walletRef.path} disponível=${BRL(wallet.availableReais)} reservado=${BRL(pending)}`);

    if (w.status !== "approved" || !["pending", "failed"].includes(w.payoutStatus)) {
      console.log("\nNada a fazer: o saque não está aprovado-e-não-pago.");
      return;
    }
    if (amount <= 0) throw new Error("valor do saque inválido");
    if (pending + 0.001 < amount) {
      throw new Error(`o caixa só tem ${BRL(pending)} reservado (< ${BRL(amount)}): a reserva já foi baixada por outro caminho`);
    }

    console.log(`\ndepois: saque payoutStatus=manual (+ reviewedAt/reviewNote) | caixa reservado=${BRL(round(pending - amount))}`);
    console.log(`nota: ${NOTE}`);
    if (!APPLY) {
      console.log("\nDRY-RUN: nada gravado. Rode de novo com --yes para aplicar.");
      return;
    }
    tx.update(walletRef, {pendingReais: round(Math.max(0, pending - amount)), updatedAt: FieldValue.serverTimestamp()});
    tx.update(ref, {
      payoutStatus: "manual",
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: "script:close-stuck-withdrawal-paid-outside",
      reviewNote: NOTE,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log("\nAPLICADO.");
  });
}

main().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
});
