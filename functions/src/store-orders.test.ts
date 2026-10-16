import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  cancelBlockReason,
  deadlineLabel,
  isLateSeparation,
  nextOrderStatus,
  orderNumber,
  orderTotalCents,
  paymentsMatch,
  pickupDeadline,
  refundableCents,
  transferCoversOrders,
  transferLinkError,
  type OrderState,
} from "./store-orders";

const state = (over: Partial<OrderState> = {}): OrderState => ({
  status: "sep", deliveryType: "arena", separatedAt: null,
  reservation: {locationId: "cd", active: true}, deliveryLocationId: "arena-errejota", transferId: null, ...over,
});

describe("pedidos · regras", () => {
  it("numera NX-xxxx", () => {
    assert.equal(orderNumber(7), "NX-0007");
    assert.equal(orderNumber(4832), "NX-4832");
  });

  it("separação: sep → sepd → separado (espera remessa) ou direto na arena", () => {
    assert.equal(nextOrderStatus(state(), "iniciar_separacao"), "sepd");
    assert.equal(nextOrderStatus(state({status: "sepd"}), "iniciar_separacao"), null);
    assert.equal(nextOrderStatus(state(), "marcar_separado"), "sepd");
    assert.equal(nextOrderStatus(state({status: "sepd", separatedAt: new Date()}), "marcar_separado"), null);
    // Reserva já no balcão da arena: pula a remessa.
    assert.equal(nextOrderStatus(state({reservation: {locationId: "arena-errejota", active: true}}), "marcar_separado"), "ret");
    // Remessa carregando as peças (reserva inativa) não conta como "na arena".
    assert.equal(nextOrderStatus(state({reservation: {locationId: "arena-errejota", active: false}}), "marcar_separado"), "sepd");
    assert.equal(nextOrderStatus(state({status: "pag"}), "marcar_separado"), null);
  });

  it("envio só para entrega em casa já separada; retirada só na arena", () => {
    const casa = state({deliveryType: "casa", deliveryLocationId: null, status: "sepd"});
    assert.equal(nextOrderStatus(casa, "enviar"), null);
    assert.equal(nextOrderStatus({...casa, separatedAt: new Date()}, "enviar"), "tra");
    assert.equal(nextOrderStatus(state({status: "sepd", separatedAt: new Date()}), "enviar"), null);
    assert.equal(nextOrderStatus(state({status: "tra"}), "entregue"), "ent");
    assert.equal(nextOrderStatus(state({status: "ret"}), "confirmar_retirada"), "rtd");
    assert.equal(nextOrderStatus(state({status: "sepd"}), "confirmar_retirada"), null);
  });

  it("cancelar: pag/sep/sepd/ret pode; trânsito, entregue e retirado não", () => {
    for (const s of ["pag", "sep", "sepd", "ret"] as const) assert.equal(nextOrderStatus(state({status: s}), "cancelar"), "can");
    for (const s of ["tra", "ent", "rtd", "can"] as const) {
      assert.equal(nextOrderStatus(state({status: s}), "cancelar"), null);
      assert.ok(cancelBlockReason(s));
    }
    assert.match(cancelBlockReason("tra")!, /troca/);
  });

  it("total = subtotal − cupom − Pix − saldo + frete; pagamentos fecham", () => {
    const total = orderTotalCents({subtotalCents: 55960, couponDiscountCents: 0, pixDiscountCents: 2798, walletCents: 4200, shippingCents: 0});
    assert.equal(total, 48962);
    assert.ok(paymentsMatch([{method: "pix", amountCents: 48962}, {method: "saldo", amountCents: 4200}], total, 4200));
    assert.ok(!paymentsMatch([{method: "pix", amountCents: 48962}], total, 4200));
    assert.equal(refundableCents({totalCents: 48962, walletCents: 4200, refundedCents: 10000}), 43162);
  });

  it("prazo de retirada: N dias depois, às 22h de São Paulo", () => {
    // Quinta 15/10 09:40 SP → domingo 18/10 22h SP = 19/10 01:00 UTC.
    const d = pickupDeadline(new Date("2026-10-15T12:40:00Z"), 3);
    assert.equal(d.toISOString(), "2026-10-19T01:00:00.000Z");
    assert.equal(deadlineLabel(d), "dom, 18 out · 22h");
    // 23h SP ainda é o mesmo dia civil em SP.
    assert.equal(pickupDeadline(new Date("2026-10-16T02:00:00Z"), 1).toISOString(), "2026-10-17T01:00:00.000Z");
  });

  it("separação atrasada: em `sep` além do prazo de manuseio", () => {
    const now = new Date("2026-10-16T15:00:00Z");
    assert.ok(isLateSeparation("sep", new Date("2026-10-15T14:00:00Z"), now, 24));
    assert.ok(!isLateSeparation("sep", new Date("2026-10-15T16:00:00Z"), now, 24));
    assert.ok(!isLateSeparation("sepd", new Date("2026-10-10T00:00:00Z"), now, 24));
  });

  it("remessa: precisa levar as peças e o pedido precisa caber nela", () => {
    const items = [{productId: "p", skuId: "m", qty: 2}];
    assert.deepEqual(transferCoversOrders([{productId: "p", skuId: "m", qty: 3}], items), []);
    assert.deepEqual(transferCoversOrders([{productId: "p", skuId: "m", qty: 1}], items), ["p/m"]);
    assert.equal(transferLinkError(state(), "cd", "arena-errejota", "t1"), null);
    assert.match(transferLinkError(state(), "cd", "arena-cfc", "t1")!, /outra arena/);
    assert.match(transferLinkError(state({deliveryType: "casa"}), "cd", "arena-errejota", "t1")!, /retirada/);
    assert.match(transferLinkError(state({transferId: "t0"}), "cd", "arena-errejota", "t1")!, /outra remessa/);
    assert.match(transferLinkError(state({status: "ret"}), "cd", "arena-errejota", "t1")!, /pagos/);
  });
});
