/* eslint-disable */
/**
 * Cria a assinatura (cobrança recorrente) das matrículas MENSAIS que já estavam ativas ou pausadas
 * antes do deploy da recorrência. O gatilho `onTrainingCenterEnrollmentBilling` só cria quando a
 * matrícula muda de status — quem já estava ativo ficaria sem cobrança mensal.
 *
 * Mesma regra do gatilho (dia de vencimento da política do centro, preço do contrato, multa/juros).
 * Para não cobrar duas vezes: se o centro já tem uma cobrança da matrícula no mês do 1º
 * vencimento (feita à mão antes da recorrência), esse ciclo é pulado. Idempotente: quem já tem
 * assinatura aparece como "exists" e não é tocado.
 *
 * Rode DEPOIS do deploy das functions da recorrência (senão a rodada diária não existe e nada é
 * cobrado) e com a política "Cobrança recorrente" do centro já revisada no portal.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-training-center-subscriptions.js --project volley-track-dev-4596c                 # dry-run, todos os centros
 *   node scripts/backfill-training-center-subscriptions.js --project volley-track-dev-4596c --center <id>
 *   node scripts/backfill-training-center-subscriptions.js --project volley-track-dev-4596c --center <id> --yes
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
const centerId = argValue("--center");

if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}

admin.initializeApp({projectId});
const {backfillSubscriptionsCore} = require("../lib/training-center-subscriptions");

const brl = (cents) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

async function main() {
  const rows = await backfillSubscriptionsCore(admin.firestore(), new Date(), {centerId, apply: APPLY});
  if (rows.length === 0) {
    console.log("Nenhuma matrícula mensal ativa ou pausada.");
    return;
  }
  for (const r of rows) {
    console.log([
      r.result.padEnd(12),
      r.centerId,
      r.enrollmentId,
      (r.name || "—").padEnd(22),
      r.status.padEnd(9),
      brl(r.priceCents).padStart(11),
      `1º vencimento ${r.nextChargeDate}`,
      r.skippedCycle ? `(${r.skippedCycle} já cobrado à mão)` : "",
    ].join("  "));
  }
  const todo = rows.filter((r) => r.result !== "exists").length;
  console.log(`\n${todo} ${APPLY ? "criadas" : "a criar"} · ${rows.length - todo} já com assinatura`);
  if (!APPLY && todo) console.log("DRY-RUN. Rode com --yes para gravar.");
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
