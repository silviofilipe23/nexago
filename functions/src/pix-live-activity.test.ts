import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  PIX_LIVE_ACTIVITY_EXPIRED_DISMISS_MS,
  PIX_LIVE_ACTIVITY_PAID_DISMISS_MS,
  PIX_LIVE_ACTIVITY_URGENT_WINDOW_MS,
  buildPixLiveActivityMessage,
  canTransitionPixLiveActivity,
  phaseForAsaasEvent,
  sweepTransitionFor,
} from "./pix-live-activity";

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;
const NOW_SECONDS = NOW / 1000;

const EXPIRES_AT = NOW + 90 * 1000;
const tokens = {fcmToken: "fcm-1", liveActivityToken: "la-1", expiresAtMs: EXPIRES_AT};

interface Aps {
  "event"?: string;
  "timestamp"?: number;
  "dismissal-date"?: number;
  "stale-date"?: number;
  "alert"?: {title?: string; body?: string};
  "content-state"?: unknown;
}

function apsOf(phase: "urgent" | "paid" | "expired", nowMs = NOW): Aps {
  const message = buildPixLiveActivityMessage({...tokens, phase, nowMs});
  return (message.apns?.payload?.aps ?? {}) as Aps;
}

describe("phaseForAsaasEvent", () => {
  it("vira pago quando o Asaas recebe ou confirma", () => {
    assert.equal(phaseForAsaasEvent("PAYMENT_RECEIVED"), "paid");
    assert.equal(phaseForAsaasEvent("PAYMENT_CONFIRMED"), "paid");
  });

  it("vira expirado quando a cobrança vence ou é apagada pela varredura", () => {
    assert.equal(phaseForAsaasEvent("PAYMENT_OVERDUE"), "expired");
    assert.equal(phaseForAsaasEvent("PAYMENT_DELETED"), "expired");
  });

  it("ignora estorno e eventos desconhecidos", () => {
    assert.equal(phaseForAsaasEvent("PAYMENT_REFUNDED"), null);
    assert.equal(phaseForAsaasEvent("PAYMENT_CREATED"), null);
    assert.equal(phaseForAsaasEvent(""), null);
  });
});

describe("canTransitionPixLiveActivity", () => {
  it("anda para frente a partir do aguardando", () => {
    assert.equal(canTransitionPixLiveActivity("waiting", "urgent"), true);
    assert.equal(canTransitionPixLiveActivity("waiting", "paid"), true);
    assert.equal(canTransitionPixLiveActivity("waiting", "expired"), true);
    assert.equal(canTransitionPixLiveActivity("urgent", "paid"), true);
    assert.equal(canTransitionPixLiveActivity("urgent", "expired"), true);
  });

  it("nunca repete a mesma fase (webhook e varredura podem chegar juntos)", () => {
    assert.equal(canTransitionPixLiveActivity("urgent", "urgent"), false);
    assert.equal(canTransitionPixLiveActivity("expired", "expired"), false);
    assert.equal(canTransitionPixLiveActivity("paid", "paid"), false);
  });

  it("pago e expirado são finais: os dois encerram a activity no iPhone", () => {
    assert.equal(canTransitionPixLiveActivity("paid", "expired"), false);
    assert.equal(canTransitionPixLiveActivity("paid", "urgent"), false);
    assert.equal(canTransitionPixLiveActivity("expired", "paid"), false);
    assert.equal(canTransitionPixLiveActivity("expired", "urgent"), false);
  });

  it("não volta do urgente para o aguardando", () => {
    assert.equal(canTransitionPixLiveActivity("urgent", "waiting"), false);
  });
});

describe("sweepTransitionFor", () => {
  it("fica quieta enquanto falta mais que a janela de urgência", () => {
    const expiresAtMs = NOW + PIX_LIVE_ACTIVITY_URGENT_WINDOW_MS + 1;
    assert.equal(sweepTransitionFor("waiting", expiresAtMs, NOW), null);
  });

  it("marca urgente quando entra nos últimos 2 minutos", () => {
    assert.equal(sweepTransitionFor("waiting", NOW + 2 * MIN, NOW), "urgent");
    assert.equal(sweepTransitionFor("waiting", NOW + 30 * 1000, NOW), "urgent");
  });

  it("não repete o urgente", () => {
    assert.equal(sweepTransitionFor("urgent", NOW + 1 * MIN, NOW), null);
  });

  it("expira quando o prazo passou, venha do aguardando ou do urgente", () => {
    assert.equal(sweepTransitionFor("waiting", NOW, NOW), "expired");
    assert.equal(sweepTransitionFor("urgent", NOW - 1, NOW), "expired");
  });

  it("não mexe em fase final", () => {
    assert.equal(sweepTransitionFor("paid", NOW - 10 * MIN, NOW), null);
    assert.equal(sweepTransitionFor("expired", NOW - 10 * MIN, NOW), null);
  });
});

describe("buildPixLiveActivityMessage", () => {
  it("manda o token do app e o da activity, com prioridade alta", () => {
    const message = buildPixLiveActivityMessage({...tokens, phase: "urgent", nowMs: NOW});
    assert.equal(message.token, "fcm-1");
    assert.equal(message.apns?.liveActivityToken, "la-1");
    assert.equal(message.apns?.headers?.["apns-priority"], "10");
  });

  it("CONTRATO: o content-state é só a fase, como o Swift decodifica", () => {
    assert.deepEqual(apsOf("urgent")["content-state"], {phase: "urgent"});
  });

  it("urgente é update com alerta e sem dismissal", () => {
    const aps = apsOf("urgent", NOW);
    assert.equal(aps.event, "update");
    assert.equal(aps.timestamp, NOW_SECONDS);
    assert.equal(aps["dismissal-date"], undefined);
    assert.equal(aps.alert?.title, "Seu Pix expira em 2 minutos");
  });

  it("urgente repete o prazo como stale-date (o push substitui o conteúdo)", () => {
    assert.equal(apsOf("urgent")["stale-date"], Math.floor(EXPIRES_AT / 1000));
    assert.equal(apsOf("paid")["stale-date"], undefined);
  });

  it("pago encerra com alerta e sai da tela em 30 minutos", () => {
    const aps = apsOf("paid", NOW);
    assert.equal(aps.event, "end");
    assert.equal(aps["dismissal-date"], (NOW + PIX_LIVE_ACTIVITY_PAID_DISMISS_MS) / 1000);
    assert.equal(aps.alert?.title, "Pagamento confirmado");
  });

  it("expirado encerra calado e sai da tela em 15 minutos", () => {
    const aps = apsOf("expired", NOW);
    assert.equal(aps.event, "end");
    assert.equal(
      aps["dismissal-date"],
      (NOW + PIX_LIVE_ACTIVITY_EXPIRED_DISMISS_MS) / 1000,
    );
    assert.equal(aps.alert, undefined);
  });

  it("timestamp é em segundos inteiros, como o APNs exige", () => {
    const aps = apsOf("paid", NOW + 750);
    assert.equal(aps.timestamp, NOW_SECONDS);
  });
});
