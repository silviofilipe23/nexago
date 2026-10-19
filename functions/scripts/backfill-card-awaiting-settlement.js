/* eslint-disable */
/**
 * Backfill do "a liberar" do caixa do torneio
 * (`tournamentWallets/{tournamentId}.awaitingSettlementReais`).
 *
 * No cartão a vaga é garantida no `CONFIRMED` e o caixa só é creditado no
 * `RECEIVED`, ~32 dias depois. Desde este campo, o webhook soma o líquido
 * previsto no `CONFIRMED` e abate no crédito. Os cartões confirmados ANTES
 * dele ficaram sem o marcador `awaitingSettlement` em
 * `asaas_processed_payments/{paymentId}` — e sem ele o caixa não mostra o
 * dinheiro a caminho.
 *
 * Como preenche: relê o pagamento no Asaas e, se ele ainda está `CONFIRMED`,
 * reprocessa o evento pela MESMA função do webhook
 * (`processTournamentRegistrationAsaasNotification`). Ela já sabe que a
 * inscrição está confirmada (não reconfirma, não notifica) e só soma o
 * "a liberar", com a mesma conta do crédito (bruto − taxa da plataforma −
 * taxa do cartão). Idempotente: o marcador é gravado na mesma transação da
 * soma, então rodar de novo não soma duas vezes.
 *
 * Pagamento que o Asaas já diz `RECEIVED` é um `RECEIVED` perdido (o caixa
 * devia ter sido creditado e não foi): só é reprocessado com
 * `--credit-received`, porque aí o efeito é CREDITAR o caixa — o mesmo que a
 * varredura de PIX vencido faria, mas é dinheiro, então é opt-in.
 *
 * ATENÇÃO — DEV é base viva: o app da loja aponta para este projeto. Rode o
 * dry-run imediatamente antes do `--yes`.
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *   npm run build   (o script usa o código compilado em lib/)
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-card-awaiting-settlement.js --project volley-track-dev-4596c
 *   node scripts/backfill-card-awaiting-settlement.js --project volley-track-dev-4596c --yes
 *   node scripts/backfill-card-awaiting-settlement.js --project volley-track-dev-4596c --yes --credit-received
 */
const admin = require("firebase-admin");
const {SecretManagerServiceClient} = require("@google-cloud/secret-manager");
const {
  isAwaitingSettlementCandidate,
  awaitingSettlementAction,
} = require("./lib/card-awaiting-settlement");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const CREDIT_RECEIVED = process.argv.includes("--credit-received");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId>");
  process.exit(1);
}

// O código das functions resolve os caminhos `artifacts/{projectId}/…` por aqui.
process.env.GCLOUD_PROJECT = projectId;
admin.initializeApp({projectId});
const db = admin.firestore();
const {processTournamentRegistrationAsaasNotification} =
  require("../lib/asaas-tournament-registration-webhook");

const BRL = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

async function secret(name) {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${name}/versions/latest`,
  });
  return version.payload.data.toString().trim();
}

async function main() {
  const apiKey = await secret("ASAAS_API_KEY");
  let env = "production";
  try {
    env = (await secret("ASAAS_ENV")).toLowerCase() === "sandbox" ? "sandbox" : "production";
  } catch {
    // sem o secret, assume produção (mesmo default do asaas-client)
  }
  const baseUrl = env === "sandbox" ? "https://api-sandbox.asaas.com" : "https://api.asaas.com";
  console.log(`Asaas: ${baseUrl} (env=${env}) | projeto: ${projectId}`);
  console.log(APPLY ? "MODO: aplicando" : "MODO: dry-run (use --yes para aplicar)");
  if (CREDIT_RECEIVED) console.log("RECEIVED perdido: será CREDITADO no caixa (--credit-received)");

  // Espelha `fetchAsaas`: GET não pode levar Content-Type (o Asaas responde 403).
  const getPayment = async (paymentId) => {
    const res = await fetch(`${baseUrl}/v3/payments/${encodeURIComponent(paymentId)}`, {
      headers: {access_token: apiKey},
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Asaas ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };

  const snap = await db
    .collection(`artifacts/${projectId}/public/data/asaas_processed_payments`)
    .where("billingType", "==", "CREDIT_CARD")
    .get();
  let candidates = snap.docs.filter((d) => isAwaitingSettlementCandidate(d.data()));
  console.log(`${snap.size} pagamentos de cartão | ${candidates.length} confirmados sem "a liberar"`);
  if (LIMIT > 0) candidates = candidates.slice(0, LIMIT);

  // Nunca deveria rodar (o candidato já está confirmado), mas se rodar não
  // pode apagar cobrança de ninguém.
  const deps = {
    cancelCharge: async (id) => {
      throw new Error(`backfill não cancela cobranças (${id})`);
    },
  };

  const rows = [];
  const heldByTournament = new Map();
  for (const doc of candidates) {
    const paymentId = doc.id;
    const data = doc.data();
    let payment;
    try {
      payment = await getPayment(paymentId);
    } catch (e) {
      rows.push({paymentId, registrationId: data.registrationId, status: "?", action: `erro Asaas: ${e.message}`});
      continue;
    }
    const status = String(payment.status || "").toUpperCase();
    const row = {
      paymentId,
      registrationId: data.registrationId || "",
      status,
      value: payment.value,
      netValue: payment.netValue,
      action: "",
    };

    const action = awaitingSettlementAction(status, {creditReceived: CREDIT_RECEIVED});
    if (action === "report_received" || action === "skip") {
      row.action = action === "report_received" ?
        "RECEIVED perdido — caixa sem crédito (rode com --credit-received)" :
        "sem ação (não vai liquidar como previsto)";
      rows.push(row);
      continue;
    }
    if (!APPLY) {
      row.action = action === "hold" ? "somaria ao a liberar" : "creditaria o caixa";
      rows.push(row);
      continue;
    }

    try {
      await processTournamentRegistrationAsaasNotification(db, paymentId, payment, doc.ref, deps);
      const after = (await doc.ref.get()).data() || {};
      if (action === "credit" && after.walletCreditedAt != null) {
        row.action = "caixa creditado";
      } else if (after.awaitingSettlement != null) {
        const {tournamentId, netReais} = after.awaitingSettlement;
        heldByTournament.set(tournamentId, (heldByTournament.get(tournamentId) || 0) + Number(netReais));
        row.action = `somado ${BRL(netReais)} em ${tournamentId}`;
      } else {
        row.action = "nada gravado — ver os logs acima";
      }
    } catch (e) {
      row.action = `erro: ${e.message}`;
    }
    rows.push(row);
  }

  if (rows.length) console.table(rows);
  if (heldByTournament.size) {
    console.log("\n\"A liberar\" somado por torneio:");
    for (const [tournamentId, total] of heldByTournament) {
      console.log(`  ${tournamentId}: ${BRL(total)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
