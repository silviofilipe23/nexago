/**
 * Testes manuais do catálogo de planos e do parse de externalReference — executar com:
 *   npx ts-node --transpile-only src/arena-subscription.test.ts
 */
import {resolvePlanPriceCents, normalizeArenaPlanTier, ACTIVATION_FEE_CENTS} from "./arena-plans";
import {
  parseSubscriptionRef,
  paymentCarriesActivation,
  shouldMarkActivationPaid,
} from "./asaas-arena-subscription-webhook";
import {
  shouldChargeActivationFee,
  activationBillingFields,
  subscriptionIdempotencyKey,
} from "./arena-subscription";

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
    withCharge.activationPaymentIds !== undefined,
    "com paymentId -> acumula o id na lista activationPaymentIds (arrayUnion)",
  );
  assert(
    Object.keys(activationBillingFields(null)).length === 0,
    "sem paymentId -> objeto vazio (merge preserva valores anteriores)",
  );

  // Ativação: "este pagamento confirmado carregava a ativação?".
  // Cenário real — gestor gera PIX mensal (pay_m), não paga, volta e escolhe
  // anual (pay_y): as duas tentativas carregam ativação, qualquer uma que
  // confirmar tem de marcar a ativação como paga.
  const twoAttempts = {
    activationPaymentId: "pay_y",
    activationPaymentIds: ["pay_m", "pay_y"],
  };
  assert(
    paymentCarriesActivation(twoAttempts, "pay_m") === true,
    "tentativa antiga na lista -> carrega ativação",
  );
  assert(
    paymentCarriesActivation(twoAttempts, "pay_y") === true,
    "tentativa mais recente -> carrega ativação",
  );
  assert(
    paymentCarriesActivation(twoAttempts, "pay_outro") === false,
    "pagamento fora da lista -> não carrega ativação",
  );
  assert(
    paymentCarriesActivation({activationPaymentId: "pay_legado"}, "pay_legado") === true,
    "billing legado (só o escalar, sem lista) -> carrega ativação",
  );
  assert(
    paymentCarriesActivation(undefined, "pay_1") === false,
    "sem billing -> não carrega ativação",
  );
  assert(
    paymentCarriesActivation({activationPaymentIds: ["pay_1"]}, "") === false,
    "paymentId vazio -> nunca casa",
  );

  // Gravação de activationFeePaidAt: uma vez só, nunca sobrescreve.
  assert(
    shouldMarkActivationPaid(twoAttempts, "pay_m") === true,
    "ativação ainda não paga + pagamento com ativação -> marca como paga",
  );
  assert(
    shouldMarkActivationPaid(
      {...twoAttempts, activationFeePaidAt: {seconds: 1}},
      "pay_y",
    ) === false,
    "ativação já paga -> não regrava (nem com outra tentativa confirmando)",
  );
  assert(
    shouldMarkActivationPaid(twoAttempts, "pay_outro") === false,
    "pagamento sem ativação embutida -> não marca",
  );

  // Chave de idempotência: muda depois de cancelar a assinatura anterior, senão
  // o Asaas devolveria a assinatura recém-deletada em vez de criar a nova.
  assert(
    subscriptionIdempotencyKey("arena1", "pro", "monthly", null) ===
      "arena-sub-arena1-pro-monthly",
    "1ª assinatura -> chave histórica (dedup de duplo clique)",
  );
  assert(
    subscriptionIdempotencyKey("arena1", "elite", "monthly", "sub_123") ===
      "arena-sub-arena1-elite-monthly-after-sub_123",
    "troca de plano -> chave nova (assinatura anterior cancelada)",
  );
  assert(
    subscriptionIdempotencyKey("arena1", "pro", "monthly", "sub_123") ===
      subscriptionIdempotencyKey("arena1", "pro", "monthly", "sub_123"),
    "mesmo estado -> mesma chave (duplo clique ainda deduplica)",
  );
  assert(
    subscriptionIdempotencyKey("arena1", "pro", "monthly", "sub_123") !==
      subscriptionIdempotencyKey("arena1", "pro", "monthly", "sub_456"),
    "novo PIX do mesmo plano depois de outro cancelamento -> chave diferente",
  );

  if (failures > 0) {
    throw new Error(`${failures} teste(s) falharam`);
  }
  // eslint-disable-next-line no-console
  console.log("arena-subscription.test.ts: OK");
}

run();
