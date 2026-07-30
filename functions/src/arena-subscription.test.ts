/**
 * Testes manuais do catálogo de planos e do parse de externalReference — executar com:
 *   npx ts-node --transpile-only src/arena-subscription.test.ts
 */
import {resolvePlanPriceCents, normalizeArenaPlanTier, ACTIVATION_FEE_CENTS} from "./arena-plans";
import {parseSubscriptionRef} from "./asaas-arena-subscription-webhook";
import {shouldChargeActivationFee, activationBillingFields} from "./arena-subscription";

let failures = 0;

function assert(cond: boolean, label: string): void {
  if (!cond) {
    failures++;
    // eslint-disable-next-line no-console
    console.error(`FAIL: ${label}`);
  }
}

function expectThrows(fn: () => unknown, label: string): void {
  try {
    fn();
    failures++;
    // eslint-disable-next-line no-console
    console.error(`FAIL (esperava throw): ${label}`);
  } catch {
    // ok
  }
}

void expectThrows; // Para satisfazer noUnusedLocals

function run(): void {
  // Catálogo: valores vêm do servidor, nunca do cliente.
  assert(resolvePlanPriceCents("starter", "monthly") === 9900, "starter mensal");
  assert(resolvePlanPriceCents("starter", "yearly") === 108000, "starter anual (12× R$90)");
  assert(resolvePlanPriceCents("pro", "monthly") === 24900, "pro mensal");
  assert(resolvePlanPriceCents("pro", "yearly") === 273600, "pro anual (12× R$228)");
  assert(resolvePlanPriceCents("elite", "monthly") === 49900, "elite mensal");
  assert(resolvePlanPriceCents("elite", "yearly") === 548400, "elite anual (12× R$457)");
  assert(ACTIVATION_FEE_CENTS === 9700, "ativação R$97");

  // Normalização de legados.
  assert(normalizeArenaPlanTier("parceiro") === "elite", "parceiro -> elite");
  assert(normalizeArenaPlanTier("essencial") === null, "essencial -> sem plano");
  assert(normalizeArenaPlanTier("starter") === "starter", "starter passa direto");
  assert(normalizeArenaPlanTier("vip") === null, "desconhecido -> null");

  // Parse do externalReference.
  const ok = parseSubscriptionRef("arenaSubscription:arena123:pro");
  assert(ok?.arenaId === "arena123" && ok?.tier === "pro", "parse válido");

  const legacy = parseSubscriptionRef("arenaSubscription:arena123:parceiro");
  assert(legacy?.arenaId === "arena123" && legacy?.tier === "elite", "ref legada parceiro -> elite");

  const withColon = parseSubscriptionRef("arenaSubscription:are:na:elite");
  assert(withColon?.arenaId === "are:na" && withColon?.tier === "elite", "parse com ':' no id");

  assert(parseSubscriptionRef("arenaBooking:arena123:pro") === null, "prefixo errado -> null");
  assert(parseSubscriptionRef("arenaSubscription:arena123:vip") === null, "tier inválido -> null");
  assert(parseSubscriptionRef("arenaSubscription:arena123") === null, "sem tier -> null");

  // Ativação: cobrada uma única vez por arena.
  assert(shouldChargeActivationFee(undefined) === true, "sem billing -> cobra ativação");
  assert(shouldChargeActivationFee({}) === true, "billing sem activationFeePaidAt -> cobra");
  assert(
    shouldChargeActivationFee({activationFeePaidAt: {seconds: 1}}) === false,
    "ativação já paga -> não cobra de novo",
  );
  assert(
    shouldChargeActivationFee({activationPaymentId: "pay_1"}) === true,
    "tentativa anterior não paga -> cobra de novo (novo paymentId substitui)",
  );

  // Payload de ativação no billing: omitido quando não houve cobrança nova
  // nesta chamada, para o merge preservar o rastro de auditoria já gravado.
  const withCharge = activationBillingFields("pay_123");
  assert(
    withCharge.activationPaymentId === "pay_123" && withCharge.activationFeeCents === 9700,
    "com paymentId -> grava activationPaymentId + activationFeeCents (9700)",
  );
  assert(
    Object.keys(activationBillingFields(null)).length === 0,
    "sem paymentId -> objeto vazio (merge preserva valores anteriores)",
  );

  if (failures > 0) {
    throw new Error(`${failures} teste(s) falharam`);
  }
  // eslint-disable-next-line no-console
  console.log("arena-subscription.test.ts: OK");
}

run();
