/**
 * Testes manuais do catálogo de planos e do parse de externalReference — executar com:
 *   npx ts-node --transpile-only src/arena-subscription.test.ts
 */
import {resolvePlanPriceCents, ARENA_PLANS} from "./arena-plans";
import {parseSubscriptionRef} from "./asaas-arena-subscription-webhook";

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

function run(): void {
  // Catálogo: valores vêm do servidor, nunca do cliente.
  assert(resolvePlanPriceCents("pro", "monthly") === ARENA_PLANS.pro.monthlyCents, "pro mensal");
  assert(resolvePlanPriceCents("pro", "yearly") === ARENA_PLANS.pro.yearlyCents, "pro anual");
  assert(resolvePlanPriceCents("parceiro", "monthly") === ARENA_PLANS.parceiro.monthlyCents, "parceiro mensal");
  expectThrows(() => resolvePlanPriceCents("essencial", "monthly"), "essencial não é cobrável");

  // Parse do externalReference.
  const ok = parseSubscriptionRef("arenaSubscription:arena123:pro");
  assert(ok?.arenaId === "arena123" && ok?.tier === "pro", "parse válido");

  // arenaId com caractere ':' (usa o último separador) + tier válido no fim.
  const withColon = parseSubscriptionRef("arenaSubscription:are:na:parceiro");
  assert(withColon?.arenaId === "are:na" && withColon?.tier === "parceiro", "parse com ':' no id");

  assert(parseSubscriptionRef("arenaBooking:arena123:pro") === null, "prefixo errado -> null");
  assert(parseSubscriptionRef("arenaSubscription:arena123:vip") === null, "tier inválido -> null");
  assert(parseSubscriptionRef("arenaSubscription:arena123") === null, "sem tier -> null");

  if (failures > 0) {
    throw new Error(`${failures} teste(s) falharam`);
  }
  // eslint-disable-next-line no-console
  console.log("arena-subscription.test.ts: OK");
}

run();
