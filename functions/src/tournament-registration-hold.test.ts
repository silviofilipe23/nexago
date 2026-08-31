import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REGISTRATION_HOLD_MINUTES,
  registrationOwnerUid,
  PIX_HOLD_MARGIN_MS,
  computeRegistrationHoldExpiryMs,
  extendHoldForPixMs,
  resolveRegistrationHoldMinutes,
  shouldTrackRegistrationHold,
} from "./tournament-registration-hold";

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;

describe("resolveRegistrationHoldMinutes", () => {
  it("torneio sem os campos vale o padrão de 30 minutos", () => {
    assert.equal(resolveRegistrationHoldMinutes({}), 30);
    assert.equal(
      resolveRegistrationHoldMinutes(null),
      DEFAULT_REGISTRATION_HOLD_MINUTES,
    );
  });

  it("organizador desligado devolve null", () => {
    assert.equal(
      resolveRegistrationHoldMinutes({registrationHoldEnabled: false}),
      null,
    );
  });

  it("respeita o tempo configurado, inclusive em string", () => {
    assert.equal(
      resolveRegistrationHoldMinutes({registrationHoldMinutes: 120}),
      120,
    );
    assert.equal(
      resolveRegistrationHoldMinutes({registrationHoldMinutes: "60"}),
      60,
    );
  });

  it("valor inválido ou zero cai no padrão, não em prazo instantâneo", () => {
    assert.equal(resolveRegistrationHoldMinutes({registrationHoldMinutes: 0}), 30);
    assert.equal(resolveRegistrationHoldMinutes({registrationHoldMinutes: -5}), 30);
    assert.equal(
      resolveRegistrationHoldMinutes({registrationHoldMinutes: "abc"}),
      30,
    );
  });

  it("desligado vence o tempo configurado", () => {
    assert.equal(
      resolveRegistrationHoldMinutes({
        registrationHoldEnabled: false,
        registrationHoldMinutes: 120,
      }),
      null,
    );
  });
});

describe("computeRegistrationHoldExpiryMs", () => {
  it("sem convite vivo, o relógio de pagamento conta de agora", () => {
    assert.equal(
      computeRegistrationHoldExpiryMs({nowMs: NOW, holdMinutes: 30}),
      NOW + 30 * MIN,
    );
  });

  it("com convite vivo, o prazo só começa depois que o convite morre", () => {
    const inviteExpiry = NOW + 48 * 60 * MIN;
    assert.equal(
      computeRegistrationHoldExpiryMs({
        nowMs: NOW,
        holdMinutes: 30,
        liveInviteExpiresAtMs: inviteExpiry,
      }),
      inviteExpiry + 30 * MIN,
    );
  });

  it("convite já vencido não estica nada", () => {
    assert.equal(
      computeRegistrationHoldExpiryMs({
        nowMs: NOW,
        holdMinutes: 30,
        liveInviteExpiresAtMs: NOW - 10 * MIN,
      }),
      NOW + 30 * MIN,
    );
  });
});

describe("extendHoldForPixMs", () => {
  it("cobrança que vence depois do prazo empurra a vaga", () => {
    const pix = NOW + 15 * MIN;
    assert.equal(
      extendHoldForPixMs(NOW + 5 * MIN, pix),
      pix + PIX_HOLD_MARGIN_MS,
    );
  });

  it("nunca encurta um prazo maior que a cobrança", () => {
    const hold = NOW + 40 * MIN;
    assert.equal(extendHoldForPixMs(hold, NOW + 15 * MIN), hold);
  });

  it("inscrição sem prazo ainda ganha o da cobrança", () => {
    const pix = NOW + 15 * MIN;
    assert.equal(extendHoldForPixMs(null, pix), pix + PIX_HOLD_MARGIN_MS);
  });
});

describe("shouldTrackRegistrationHold", () => {
  it("inscrição pendente sem pagamento entra na regra", () => {
    assert.equal(
      shouldTrackRegistrationHold({isPaid: false, paidAmount: 0}),
      true,
    );
  });

  it("fila de espera não ocupa vaga, então não tem prazo", () => {
    assert.equal(
      shouldTrackRegistrationHold({isPaid: false, waitlist: true}),
      false,
    );
  });

  it("qualquer pagamento tira a inscrição da regra", () => {
    assert.equal(shouldTrackRegistrationHold({isPaid: true}), false);
    assert.equal(
      shouldTrackRegistrationHold({isPaid: false, sharePaidUids: ["uid-1"]}),
      false,
    );
    assert.equal(
      shouldTrackRegistrationHold({isPaid: false, paidAmount: 5000}),
      false,
    );
  });
});

describe("registrationOwnerUid", () => {
  it("capitão manda na equipe", () => {
    assert.equal(
      registrationOwnerUid({captainUid: "cap", player1Id: "p1"}),
      "cap",
    );
  });

  it("dupla/solo caem no player1", () => {
    assert.equal(registrationOwnerUid({player1Id: "p1"}), "p1");
  });

  it("inscrição nascida no aceite não tem dono declarado: usa o 1º participante", () => {
    assert.equal(
      registrationOwnerUid({participantUids: ["", "  ", "uid-a", "uid-b"]}),
      "uid-a",
    );
  });

  it("sem nada devolve vazio, não undefined", () => {
    assert.equal(registrationOwnerUid({}), "");
    assert.equal(registrationOwnerUid(null), "");
  });
});
